using DigiMenu.Api.Data;
using DigiMenu.Api.DTOs;
using DigiMenu.Api.Domain;
using DigiMenu.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/superadmin")]
[Authorize(Policy = "RequireSuperadmin")]
public class SuperadminController(DigiMenuDbContext db, IKimiTemplateAdvisor kimi, IFileStorage storage) : ControllerBase
{
    Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("businesses")]
    public async Task<IResult> Businesses() => Results.Ok(await db.Businesses.OrderBy(x => x.Name).ToListAsync());

    [HttpGet("businesses/{businessId:guid}")]
    public async Task<IResult> Business(Guid businessId) => await db.Businesses.FindAsync(businessId) is { } business ? Results.Ok(business) : Results.NotFound();

    [HttpPost("businesses")]
    public async Task<IResult> CreateBusiness(CreateBusinessRequest input)
    {
        var slug = Normalize(input.Slug);
        if (string.IsNullOrWhiteSpace(slug)) return Results.BadRequest(new { message = "El slug es obligatorio." });
        if (await db.Businesses.AnyAsync(x => x.Slug == slug)) return Results.Conflict(new { message = "El slug ya existe." });
        var business = new Business { Id = Guid.NewGuid(), Name = input.Name.Trim(), Slug = slug, BusinessType = input.BusinessType };
        db.Businesses.Add(business); Audit("CreateBusiness", "Business", business.Id, business.Id); await db.SaveChangesAsync();
        return Results.Created($"api/superadmin/businesses/{business.Id}", business);
    }

    [HttpPatch("businesses/{businessId:guid}/status")]
    public async Task<IResult> Status(Guid businessId, [FromBody] bool active)
    {
        var business = await db.Businesses.FindAsync(businessId); if (business is null) return Results.NotFound();
        business.IsActive = active; business.UpdatedAt = DateTime.UtcNow; Audit("ChangeBusinessStatus", "Business", businessId, businessId); await db.SaveChangesAsync(); return Results.Ok(business);
    }

    [HttpGet("businesses/{businessId:guid}/users")]
    public async Task<IResult> BusinessUsers(Guid businessId) => Results.Ok(await db.UserBusinesses.Where(x => x.BusinessID == businessId).Include(x => x.User).Select(x => new { MembershipId = x.Id, x.Role, x.IsActive, UserId = x.User.Id, x.User.Email, x.User.DisplayName }).ToListAsync());

    [HttpPost("businesses/{businessId:guid}/users")]
    public async Task<IResult> CreateBusinessAdmin(Guid businessId, CreateBusinessUserRequest input)
    {
        if (!await db.Businesses.AnyAsync(x => x.Id == businessId)) return Results.NotFound();
        if (await db.Users.AnyAsync(x => x.Email == input.Email)) return Results.Conflict(new { message = "El correo ya existe." });
        var user = new AppUser { Id = Guid.NewGuid(), Email = input.Email.Trim().ToLowerInvariant(), DisplayName = input.DisplayName, PasswordHash = "" };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, input.Password);
        db.Users.Add(user); db.UserBusinesses.Add(new UserBusiness { Id = Guid.NewGuid(), UserId = user.Id, BusinessID = businessId, Role = Role.BusinessAdmin }); Audit("CreateBusinessAdmin", "User", user.Id, businessId); await db.SaveChangesAsync();
        return Results.Created($"api/superadmin/users/{user.Id}", new { user.Id, user.Email });
    }

    [HttpPut("users/{userId:guid}")]
    public async Task<IResult> UpdateBusinessUser(Guid userId, UpdateBusinessUserRequest input)
    {
        var user = await db.Users.FindAsync(userId); if (user is null) return Results.NotFound();
        if (input.DisplayName is not null) user.DisplayName = input.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(input.Password)) user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, input.Password);
        Audit("UpdateBusinessUser", "User", userId, (await db.UserBusinesses.Where(x => x.UserId == userId).Select(x => x.BusinessID).FirstOrDefaultAsync()));
        await db.SaveChangesAsync(); return Results.Ok(new { user.Id, user.Email, user.DisplayName });
    }

    [HttpPatch("users/{userId:guid}/status")]
    public async Task<IResult> ChangeUserStatus(Guid userId, UserStatusRequest input)
    {
        var user = await db.Users.FindAsync(userId); if (user is null) return Results.NotFound();
        user.IsActive = input.IsActive;
        var memberships = await db.UserBusinesses.Where(x => x.UserId == userId).ToListAsync(); foreach (var membership in memberships) membership.IsActive = input.IsActive;
        Audit("ChangeUserStatus", "User", userId, memberships.FirstOrDefault()?.BusinessID ?? Guid.Empty);
        await db.SaveChangesAsync(); return Results.Ok(new { user.Id, user.IsActive });
    }

    [HttpGet("businesses/{businessId:guid}/pdf-template")]
    public async Task<IResult> GetTemplate(Guid businessId) => Results.Ok(await db.BusinessPdfTemplates.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.IsActive).ThenByDescending(x => x.UpdatedAt).ToListAsync());

    [HttpGet("businesses/{businessId:guid}/pdf-fonts")]
    public async Task<IResult> GetFonts(Guid businessId) => Results.Ok(await db.BusinessPdfFonts.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.IsActive).ThenByDescending(x => x.CreatedAt).ToListAsync());

    [HttpPost("businesses/{businessId:guid}/pdf-fonts")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IResult> UploadFont(Guid businessId, IFormFile file)
    {
        if (!await db.Businesses.AnyAsync(x => x.Id == businessId)) return Results.NotFound();
        if (file.Length == 0 || file.Length > 5_000_000 || !string.Equals(Path.GetExtension(file.FileName), ".ttf", StringComparison.OrdinalIgnoreCase)) return Results.BadRequest(new { message = "Selecciona una fuente .ttf de hasta 5 MB." });
        var name = Path.GetFileNameWithoutExtension(file.FileName).Trim(); if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { message = "El archivo necesita un nombre válido." });
        if (await db.BusinessPdfFonts.AnyAsync(x => x.BusinessID == businessId && x.Name == name)) return Results.Conflict(new { message = "Ya existe una fuente con ese nombre." });
        var key = await storage.SaveAsync(file.OpenReadStream(), file.FileName, "font/ttf", HttpContext.RequestAborted);
        var font = new BusinessPdfFont { Id = Guid.NewGuid(), BusinessID = businessId, Name = name, FileUrl = key };
        db.BusinessPdfFonts.Add(font); Audit("UploadPdfFont", "BusinessPdfFont", font.Id, businessId); await db.SaveChangesAsync(); return Results.Created($"api/superadmin/pdf-fonts/{font.Id}", font);
    }

    [HttpPost("pdf-fonts/{fontId:guid}/activate")]
    public async Task<IResult> ActivateFont(Guid fontId)
    {
        var font = await db.BusinessPdfFonts.FindAsync(fontId); if (font is null) return Results.NotFound();
        var previous = await db.BusinessPdfFonts.Where(x => x.BusinessID == font.BusinessID && x.Id != font.Id && x.IsActive).ToListAsync(); foreach (var item in previous) item.IsActive = false;
        font.IsActive = true; Audit("ActivatePdfFont", "BusinessPdfFont", font.Id, font.BusinessID); await db.SaveChangesAsync(); return Results.Ok(font);
    }

    [HttpPost("businesses/{businessId:guid}/pdf-template")]
    public async Task<IResult> CreateTemplate(Guid businessId, TemplateRequest input)
    {
        if (!await db.Businesses.AnyAsync(x => x.Id == businessId)) return Results.NotFound();
        var template = FromRequest(businessId, input); db.BusinessPdfTemplates.Add(template); Audit("CreatePdfTemplate", "BusinessPdfTemplate", template.Id, businessId); await db.SaveChangesAsync();
        return Results.Created($"api/superadmin/pdf-templates/{template.Id}", template);
    }

    [HttpPut("pdf-templates/{templateId:guid}")]
    public async Task<IResult> UpdateTemplate(Guid templateId, TemplateRequest input)
    {
        var template = await db.BusinessPdfTemplates.FindAsync(templateId); if (template is null) return Results.NotFound();
        Apply(template, input); template.UpdatedAt = DateTime.UtcNow; Audit("UpdatePdfTemplate", "BusinessPdfTemplate", templateId, template.BusinessID); await db.SaveChangesAsync(); return Results.Ok(template);
    }

    [HttpPost("pdf-templates/{templateId:guid}/preview")]
    public async Task<IResult> PreviewTemplate(Guid templateId)
    {
        var template = await db.BusinessPdfTemplates.FindAsync(templateId); if (template is null) return Results.NotFound();
        return Results.Ok(new { template.Id, template.PageSize, template.Orientation, template.LayoutConfigurationJson, template.TypographyConfigurationJson, template.ColorConfigurationJson, template.DecorationConfigurationJson, message = "Configuración lista para vista previa interna." });
    }

    [HttpPost("pdf-templates/{templateId:guid}/approve")]
    public async Task<IResult> ApproveTemplate(Guid templateId)
    {
        var template = await db.BusinessPdfTemplates.FindAsync(templateId); if (template is null) return Results.NotFound();
        await ActivateTemplate(template); Audit("ApprovePdfTemplate", "BusinessPdfTemplate", templateId, template.BusinessID); await db.SaveChangesAsync(); return Results.Ok(template);
    }

    [HttpPost("businesses/{businessId:guid}/pdf-analysis")]
    public async Task<IResult> Analyze(Guid businessId, AnalysisRequest input)
    {
        return Results.BadRequest(new { message = "Sube el PDF de referencia para analizar sus estilos." });
    }

    [HttpPost("businesses/{businessId:guid}/pdf-analysis/upload")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IResult> UploadAndAnalyze(Guid businessId, IFormFile file, IFormFile? headerBackground, IFormFile? innerBackground)
    {
        if (!await db.Businesses.AnyAsync(x => x.Id == businessId)) return Results.NotFound();
        var allowedTypes = new[] { "application/pdf", "image/png", "image/jpeg", "image/webp" };
        if (file.Length == 0 || file.Length > 15_000_000 || !allowedTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase)) return Results.BadRequest(new { message = "Selecciona un PDF, PNG, JPG o WebP de hasta 15 MB." });
        var backgroundTypes = new[] { "image/png", "image/jpeg", "image/webp" };
        if (headerBackground is not null && (headerBackground.Length == 0 || headerBackground.Length > 10_000_000 || !backgroundTypes.Contains(headerBackground.ContentType, StringComparer.OrdinalIgnoreCase))) return Results.BadRequest(new { message = "El fondo del encabezado debe ser PNG, JPG o WebP de hasta 10 MB." });
        if (innerBackground is not null && (innerBackground.Length == 0 || innerBackground.Length > 10_000_000 || !backgroundTypes.Contains(innerBackground.ContentType, StringComparer.OrdinalIgnoreCase))) return Results.BadRequest(new { message = "El fondo interior debe ser PNG, JPG o WebP de hasta 10 MB." });
        await using var input = file.OpenReadStream(); await using var buffer = new MemoryStream(); await input.CopyToAsync(buffer, HttpContext.RequestAborted); var bytes = buffer.ToArray();
        var uploadedHeader = await SaveBackground(headerBackground, businessId, "encabezado");
        var uploadedInterior = await SaveBackground(innerBackground, businessId, "interior");
        var key = await storage.SaveAsync(new MemoryStream(bytes), file.FileName, file.ContentType, HttpContext.RequestAborted);
        var analysis = new PdfTemplateAnalysis { Id = Guid.NewGuid(), BusinessID = businessId, SourceFileUrl = key, Status = AnalysisStatus.Processing, Provider = "KIMI", Model = HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Kimi:Model"] ?? "kimi-k2.7-code" };
        db.PdfTemplateAnalyses.Add(analysis); await db.SaveChangesAsync();
        try { var (suggestion, confidence) = await kimi.AnalyzeAsync(bytes, file.ContentType, null, HttpContext.RequestAborted); analysis.SuggestedTemplateJson = AddUploadedAssets(suggestion, uploadedHeader, uploadedInterior); analysis.ConfidenceScore = confidence; analysis.Status = AnalysisStatus.NeedsReview; analysis.CompletedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Accepted($"api/superadmin/pdf-analysis/{analysis.Id}", analysis); }
        catch (Exception ex) { analysis.Status = AnalysisStatus.Failed; analysis.ErrorMessage = ex.Message; analysis.CompletedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Problem($"No fue posible analizar la plantilla: {ex.Message}", statusCode: StatusCodes.Status502BadGateway); }
    }

    [HttpGet("businesses/{businessId:guid}/pdf-analysis")]
    public async Task<IResult> Analyses(Guid businessId) => Results.Ok(await db.PdfTemplateAnalyses.Where(x => x.BusinessID == businessId).OrderByDescending(x => x.CreatedAt).ToListAsync());

    [HttpGet("pdf-analysis/{analysisId:guid}")]
    public async Task<IResult> GetAnalysis(Guid analysisId) => await db.PdfTemplateAnalyses.FindAsync(analysisId) is { } analysis ? Results.Ok(analysis) : Results.NotFound();

    [HttpPost("pdf-analysis/{analysisId:guid}/approve")]
    public async Task<IResult> ApproveAnalysis(Guid analysisId)
    {
        var analysis = await db.PdfTemplateAnalyses.FindAsync(analysisId); if (analysis is null) return Results.NotFound();
        if (analysis.Status != AnalysisStatus.NeedsReview || string.IsNullOrWhiteSpace(analysis.SuggestedTemplateJson)) return Results.BadRequest(new { message = "El análisis no está listo para revisión." });
        analysis.Status = AnalysisStatus.Approved; analysis.ReviewedAt = DateTime.UtcNow; analysis.ReviewedByUserId = Actor;
        var decoration = JsonObject(analysis.SuggestedTemplateJson, "decoration");
        var gothicMarble = JsonValue(decoration, "themeKey", "none").Equals("gothic-marble", StringComparison.OrdinalIgnoreCase);
        var uploadedHeader = JsonValue(analysis.SuggestedTemplateJson, "coverBackgroundUrl", "");
        var uploadedInterior = JsonValue(analysis.SuggestedTemplateJson, "innerPageBackgroundUrl", "");
        var template = new BusinessPdfTemplate { Id = Guid.NewGuid(), BusinessID = analysis.BusinessID, Name = JsonValue(analysis.SuggestedTemplateJson, "name", $"Sugerencia KIMI {DateTime.UtcNow:yyyy-MM-dd}"), PageSize = JsonValue(analysis.SuggestedTemplateJson, "pageSize", "A4"), Orientation = gothicMarble ? "Portrait" : JsonValue(analysis.SuggestedTemplateJson, "orientation", "Portrait"), Status = TemplateStatus.Draft, LayoutConfigurationJson = JsonObject(analysis.SuggestedTemplateJson, "layout"), TypographyConfigurationJson = JsonObject(analysis.SuggestedTemplateJson, "typography"), ColorConfigurationJson = gothicMarble ? "{\"textColor\":\"#17110f\",\"accentColor\":\"#17110f\",\"mutedColor\":\"#5d6260\"}" : JsonObject(analysis.SuggestedTemplateJson, "colors"), DecorationConfigurationJson = decoration, CoverBackgroundUrl = !string.IsNullOrWhiteSpace(uploadedHeader) ? uploadedHeader : gothicMarble ? "Assets/ViudaNegra/header-v2.png" : null, InnerPageBackgroundUrl = !string.IsNullOrWhiteSpace(uploadedInterior) ? uploadedInterior : gothicMarble ? "Assets/ViudaNegra/interior-v3.png" : null, CreatedFromAI = true };
        db.BusinessPdfTemplates.Add(template); Audit("ApprovePdfAnalysis", "PdfTemplateAnalysis", analysis.Id, analysis.BusinessID); await db.SaveChangesAsync();
        return Results.Ok(new { analysis, template });
    }

    [HttpPost("pdf-analysis/{analysisId:guid}/reject")]
    public async Task<IResult> RejectAnalysis(Guid analysisId)
    {
        var analysis = await db.PdfTemplateAnalyses.FindAsync(analysisId); if (analysis is null) return Results.NotFound(); analysis.Status = AnalysisStatus.Rejected; analysis.ReviewedAt = DateTime.UtcNow; analysis.ReviewedByUserId = Actor; await db.SaveChangesAsync(); return Results.NoContent();
    }

    async Task ActivateTemplate(BusinessPdfTemplate template)
    {
        var current = await db.BusinessPdfTemplates.Where(x => x.BusinessID == template.BusinessID && x.Id != template.Id && x.IsActive).ToListAsync();
        foreach (var item in current) { item.IsActive = false; item.Status = TemplateStatus.Archived; item.UpdatedAt = DateTime.UtcNow; }
        template.Status = TemplateStatus.Approved; template.IsActive = true; template.ApprovedAt = DateTime.UtcNow; template.ApprovedByUserId = Actor; template.UpdatedAt = DateTime.UtcNow;
    }
    BusinessPdfTemplate FromRequest(Guid businessId, TemplateRequest input) { var template = new BusinessPdfTemplate { Id = Guid.NewGuid(), BusinessID = businessId, Name = input.Name.Trim(), Status = TemplateStatus.Draft, IsActive = false, LayoutConfigurationJson = "{}" }; Apply(template, input); return template; }
    static void Apply(BusinessPdfTemplate x, TemplateRequest input) { x.Name = input.Name.Trim(); x.PageSize = input.PageSize; x.Orientation = input.Orientation; x.LayoutConfigurationJson = input.LayoutConfigurationJson; x.TypographyConfigurationJson = input.TypographyConfigurationJson; x.ColorConfigurationJson = input.ColorConfigurationJson; x.DecorationConfigurationJson = input.DecorationConfigurationJson; x.CoverBackgroundUrl = input.CoverBackgroundUrl; x.InnerPageBackgroundUrl = input.InnerPageBackgroundUrl; }
    static string JsonObject(string json, string property) { try { using var doc = System.Text.Json.JsonDocument.Parse(json); return doc.RootElement.TryGetProperty(property, out var value) && value.ValueKind == System.Text.Json.JsonValueKind.Object ? value.GetRawText() : "{}"; } catch { return "{}"; } }
    static string JsonValue(string json, string property, string fallback) { try { using var doc = System.Text.Json.JsonDocument.Parse(json); return doc.RootElement.TryGetProperty(property, out var value) && value.ValueKind == System.Text.Json.JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString()! : fallback; } catch { return fallback; } }
    async Task<string?> SaveBackground(IFormFile? file, Guid businessId, string label)
    {
        if (file is null || file.Length == 0) return null;
        var allowed = new[] { "image/png", "image/jpeg", "image/webp" };
        if (file.Length > 10_000_000 || !allowed.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException($"El fondo de {label} debe ser PNG, JPG o WebP de hasta 10 MB.");
        return await storage.SaveAsync(file.OpenReadStream(), $"business-{businessId:N}-{label}{Path.GetExtension(file.FileName)}", file.ContentType, HttpContext.RequestAborted);
    }
    static string AddUploadedAssets(string suggestion, string? header, string? interior)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(string.IsNullOrWhiteSpace(suggestion) ? "{}" : suggestion);
            var root = System.Text.Json.Nodes.JsonNode.Parse(document.RootElement.GetRawText())?.AsObject() ?? new System.Text.Json.Nodes.JsonObject();
            if (!string.IsNullOrWhiteSpace(header)) root["coverBackgroundUrl"] = header;
            if (!string.IsNullOrWhiteSpace(interior)) root["innerPageBackgroundUrl"] = interior;
            return root.ToJsonString();
        }
        catch { return suggestion; }
    }
    void Audit(string action, string type, Guid entityId, Guid businessId) => db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = Actor, BusinessID = businessId, Action = action, EntityType = type, EntityId = entityId.ToString() });
    static string Normalize(string value) => System.Text.RegularExpressions.Regex.Replace(value.Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
}
