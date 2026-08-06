using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using DigiMenu.Api.Data;
using DigiMenu.Api.Domain;
using DigiMenu.Api.DTOs;
using DigiMenu.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/admin/design")]
[Authorize(Policy = "RequireBusinessAccess")]
public class AdminDesignController(DigiMenuDbContext db, IBusinessAccess access, IKimiTemplateAdvisor kimi, IFileStorage storage) : ControllerBase
{
    async Task<Guid> Business() => await access.CurrentBusinessId(User);
    Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("templates")]
    public async Task<IResult> Templates()
    {
        var businessId = await Business();
        return Results.Ok(await db.BusinessPdfTemplates.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.IsActive).ThenByDescending(x => x.UpdatedAt).ToListAsync());
    }

    [HttpPost("templates")]
    public async Task<IResult> CreateTemplate(TemplateRequest input)
    {
        var businessId = await Business();
        if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { message = "El nombre de la plantilla es obligatorio." });
        var template = new BusinessPdfTemplate { Id = Guid.NewGuid(), BusinessID = businessId, Name = input.Name.Trim(), PageSize = input.PageSize, Orientation = input.Orientation, Status = TemplateStatus.Draft, LayoutConfigurationJson = input.LayoutConfigurationJson, TypographyConfigurationJson = input.TypographyConfigurationJson, ColorConfigurationJson = input.ColorConfigurationJson, DecorationConfigurationJson = input.DecorationConfigurationJson, CoverBackgroundUrl = input.CoverBackgroundUrl, InnerPageBackgroundUrl = input.InnerPageBackgroundUrl };
        db.BusinessPdfTemplates.Add(template); Audit("CreatePdfTemplate", "BusinessPdfTemplate", template.Id, businessId); await db.SaveChangesAsync(); return Results.Created($"api/admin/design/templates/{template.Id}", template);
    }

    [HttpPost("templates/{templateId:guid}/activate")]
    public async Task<IResult> ActivateTemplate(Guid templateId)
    {
        var businessId = await Business();
        var template = await db.BusinessPdfTemplates.SingleOrDefaultAsync(x => x.Id == templateId && x.BusinessID == businessId); if (template is null) return Results.NotFound();
        var current = await db.BusinessPdfTemplates.Where(x => x.BusinessID == businessId && x.Id != template.Id && x.IsActive).ToListAsync();
        foreach (var item in current) { item.IsActive = false; item.Status = TemplateStatus.Archived; item.UpdatedAt = DateTime.UtcNow; }
        template.Status = TemplateStatus.Approved; template.IsActive = true; template.ApprovedAt = DateTime.UtcNow; template.ApprovedByUserId = Actor; template.UpdatedAt = DateTime.UtcNow;
        Audit("ActivatePdfTemplate", "BusinessPdfTemplate", template.Id, businessId); await db.SaveChangesAsync(); return Results.Ok(template);
    }

    [HttpGet("fonts")]
    public async Task<IResult> Fonts()
    {
        var businessId = await Business();
        return Results.Ok(await db.BusinessPdfFonts.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.IsActive).ThenByDescending(x => x.CreatedAt).ToListAsync());
    }

    [HttpPost("fonts")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IResult> UploadFont(IFormFile file)
    {
        var businessId = await Business();
        if (file.Length == 0 || file.Length > 5_000_000 || !string.Equals(Path.GetExtension(file.FileName), ".ttf", StringComparison.OrdinalIgnoreCase)) return Results.BadRequest(new { message = "Selecciona una fuente .ttf de hasta 5 MB." });
        var name = Path.GetFileNameWithoutExtension(file.FileName).Trim(); if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { message = "El archivo necesita un nombre válido." });
        if (await db.BusinessPdfFonts.AnyAsync(x => x.BusinessID == businessId && x.Name == name)) return Results.Conflict(new { message = "Ya existe una fuente con ese nombre." });
        var key = await storage.SaveAsync(file.OpenReadStream(), file.FileName, "font/ttf", HttpContext.RequestAborted);
        var font = new BusinessPdfFont { Id = Guid.NewGuid(), BusinessID = businessId, Name = name, FileUrl = key };
        db.BusinessPdfFonts.Add(font); Audit("UploadPdfFont", "BusinessPdfFont", font.Id, businessId); await db.SaveChangesAsync(); return Results.Created($"api/admin/design/fonts/{font.Id}", font);
    }

    [HttpPost("fonts/{fontId:guid}/activate")]
    public async Task<IResult> ActivateFont(Guid fontId)
    {
        var businessId = await Business();
        var font = await db.BusinessPdfFonts.SingleOrDefaultAsync(x => x.Id == fontId && x.BusinessID == businessId); if (font is null) return Results.NotFound();
        var previous = await db.BusinessPdfFonts.Where(x => x.BusinessID == businessId && x.Id != font.Id && x.IsActive).ToListAsync(); foreach (var item in previous) item.IsActive = false;
        font.IsActive = true; Audit("ActivatePdfFont", "BusinessPdfFont", font.Id, businessId); await db.SaveChangesAsync(); return Results.Ok(font);
    }

    [HttpGet("analyses")]
    public async Task<IResult> Analyses()
    {
        var businessId = await Business();
        return Results.Ok(await db.PdfTemplateAnalyses.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.CreatedAt).ToListAsync());
    }

    [HttpPost("analyses/upload")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IResult> UploadAndAnalyze(IFormFile file, IFormFile? headerBackground, IFormFile? innerBackground)
    {
        var businessId = await Business();
        var allowedTypes = new[] { "application/pdf", "image/png", "image/jpeg", "image/webp" };
        var imageTypes = new[] { "image/png", "image/jpeg", "image/webp" };
        if (file.Length == 0 || file.Length > 15_000_000 || !allowedTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase)) return Results.BadRequest(new { message = "Selecciona un PDF, PNG, JPG o WebP de hasta 15 MB." });
        if (headerBackground is not null && (headerBackground.Length == 0 || headerBackground.Length > 10_000_000 || !imageTypes.Contains(headerBackground.ContentType, StringComparer.OrdinalIgnoreCase))) return Results.BadRequest(new { message = "El fondo del encabezado debe ser PNG, JPG o WebP de hasta 10 MB." });
        if (innerBackground is not null && (innerBackground.Length == 0 || innerBackground.Length > 10_000_000 || !imageTypes.Contains(innerBackground.ContentType, StringComparer.OrdinalIgnoreCase))) return Results.BadRequest(new { message = "El fondo interior debe ser PNG, JPG o WebP de hasta 10 MB." });
        await using var input = file.OpenReadStream(); await using var buffer = new MemoryStream(); await input.CopyToAsync(buffer, HttpContext.RequestAborted); var bytes = buffer.ToArray();
        var header = await SaveBackground(headerBackground, businessId, "encabezado"); var interior = await SaveBackground(innerBackground, businessId, "interior");
        var key = await storage.SaveAsync(new MemoryStream(bytes), file.FileName, file.ContentType, HttpContext.RequestAborted);
        var analysis = new PdfTemplateAnalysis { Id = Guid.NewGuid(), BusinessID = businessId, SourceFileUrl = key, Status = AnalysisStatus.Processing, Provider = "KIMI", Model = HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Kimi:Model"] ?? "kimi-k2.7-code" };
        db.PdfTemplateAnalyses.Add(analysis); await db.SaveChangesAsync();
        try
        {
            var (suggestion, confidence) = await kimi.AnalyzeAsync(bytes, file.ContentType, null, HttpContext.RequestAborted);
            analysis.SuggestedTemplateJson = AddUploadedAssets(suggestion, header, interior); analysis.ConfidenceScore = confidence; analysis.Status = AnalysisStatus.NeedsReview; analysis.CompletedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Accepted($"api/admin/design/analyses/{analysis.Id}", analysis);
        }
        catch (Exception exception) { analysis.Status = AnalysisStatus.Failed; analysis.ErrorMessage = exception.Message; analysis.CompletedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Problem("No fue posible analizar la plantilla.", statusCode: StatusCodes.Status502BadGateway); }
    }

    [HttpPost("analyses/{analysisId:guid}/approve")]
    public async Task<IResult> ApproveAnalysis(Guid analysisId)
    {
        var businessId = await Business();
        var analysis = await db.PdfTemplateAnalyses.SingleOrDefaultAsync(x => x.Id == analysisId && x.BusinessID == businessId); if (analysis is null) return Results.NotFound();
        if (analysis.Status != AnalysisStatus.NeedsReview || string.IsNullOrWhiteSpace(analysis.SuggestedTemplateJson)) return Results.BadRequest(new { message = "El análisis no está listo para revisión." });
        analysis.Status = AnalysisStatus.Approved; analysis.ReviewedAt = DateTime.UtcNow; analysis.ReviewedByUserId = Actor;
        var decoration = JsonObject(analysis.SuggestedTemplateJson, "decoration"); var gothic = JsonValue(decoration, "themeKey", "none").Equals("gothic-marble", StringComparison.OrdinalIgnoreCase);
        var header = JsonValue(analysis.SuggestedTemplateJson, "coverBackgroundUrl", "");
        var interior = JsonValue(analysis.SuggestedTemplateJson, "innerPageBackgroundUrl", "");
        var template = new BusinessPdfTemplate { Id = Guid.NewGuid(), BusinessID = businessId, Name = JsonValue(analysis.SuggestedTemplateJson, "name", $"Plantilla {DateTime.UtcNow:yyyy-MM-dd}"), PageSize = JsonValue(analysis.SuggestedTemplateJson, "pageSize", "A4"), Orientation = gothic ? "Portrait" : JsonValue(analysis.SuggestedTemplateJson, "orientation", "Portrait"), Status = TemplateStatus.Draft, LayoutConfigurationJson = JsonObject(analysis.SuggestedTemplateJson, "layout"), TypographyConfigurationJson = JsonObject(analysis.SuggestedTemplateJson, "typography"), ColorConfigurationJson = JsonObject(analysis.SuggestedTemplateJson, "colors"), DecorationConfigurationJson = decoration, CoverBackgroundUrl = string.IsNullOrWhiteSpace(header) ? null : header, InnerPageBackgroundUrl = string.IsNullOrWhiteSpace(interior) ? null : interior, CreatedFromAI = true };
        db.BusinessPdfTemplates.Add(template); Audit("ApprovePdfAnalysis", "PdfTemplateAnalysis", analysis.Id, businessId); await db.SaveChangesAsync(); return Results.Ok(new { analysis, template });
    }

    [HttpPost("analyses/{analysisId:guid}/reject")]
    public async Task<IResult> RejectAnalysis(Guid analysisId)
    {
        var businessId = await Business();
        var analysis = await db.PdfTemplateAnalyses.SingleOrDefaultAsync(x => x.Id == analysisId && x.BusinessID == businessId); if (analysis is null) return Results.NotFound();
        analysis.Status = AnalysisStatus.Rejected; analysis.ReviewedAt = DateTime.UtcNow; analysis.ReviewedByUserId = Actor; await db.SaveChangesAsync(); return Results.NoContent();
    }

    async Task<string?> SaveBackground(IFormFile? file, Guid businessId, string label) => file is null || file.Length == 0 ? null : await storage.SaveAsync(file.OpenReadStream(), $"business-{businessId:N}-{label}{Path.GetExtension(file.FileName)}", file.ContentType, HttpContext.RequestAborted);
    static string JsonObject(string json, string property) { try { using var doc = JsonDocument.Parse(json); return doc.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Object ? value.GetRawText() : "{}"; } catch { return "{}"; } }
    static string JsonValue(string json, string property, string fallback) { try { using var doc = JsonDocument.Parse(json); return doc.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString()! : fallback; } catch { return fallback; } }
    static string AddUploadedAssets(string suggestion, string? header, string? interior) { try { var root = JsonNode.Parse(string.IsNullOrWhiteSpace(suggestion) ? "{}" : suggestion)?.AsObject() ?? new JsonObject(); if (!string.IsNullOrWhiteSpace(header)) root["coverBackgroundUrl"] = header; if (!string.IsNullOrWhiteSpace(interior)) root["innerPageBackgroundUrl"] = interior; return root.ToJsonString(); } catch { return suggestion; } }
    void Audit(string action, string entityType, Guid entityId, Guid businessId) => db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = Actor, BusinessID = businessId, Action = action, EntityType = entityType, EntityId = entityId.ToString() });
}
