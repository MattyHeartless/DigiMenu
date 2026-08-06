using System.Text.Json;
using System.Collections.Concurrent;
using DigiMenu.Api.Data;
using DigiMenu.Api.Domain;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Drawing;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace DigiMenu.Api.Services;

public interface IPdfService
{
    Task<BusinessPdfDocument> GenerateDraftAsync(Guid businessId, Guid userId, CancellationToken ct, string? coverBackgroundOverride = null, string? innerPageBackgroundOverride = null);
    Task PublishAsync(Guid businessId, Guid documentId, Guid userId, CancellationToken ct);
}

public class PdfService(DigiMenuDbContext db, IFileStorage storage, IWebHostEnvironment environment, ILogger<PdfService> log) : IPdfService
{
    // QuestPDF keeps registered fonts for the lifetime of the process.  A stable,
    // per-upload alias prevents filename collisions between businesses.
    static readonly ConcurrentDictionary<Guid, byte> RegisteredFonts = new();

    public async Task<BusinessPdfDocument> GenerateDraftAsync(Guid businessId, Guid userId, CancellationToken ct, string? coverBackgroundOverride = null, string? innerPageBackgroundOverride = null)
    {
        var template = await db.BusinessPdfTemplates.SingleOrDefaultAsync(x => x.BusinessID == businessId && x.IsActive && x.Status == TemplateStatus.Approved, ct)
            ?? throw new InvalidOperationException("Este negocio aún no cuenta con una plantilla PDF aprobada.");
        var business = await db.Businesses.SingleAsync(x => x.Id == businessId, ct);
        var categories = await db.Categories.Where(x => x.BusinessID == businessId && x.IsActive)
            .Include(x => x.Products.Where(p => p.IsActive && p.IsAvailable)).OrderBy(x => x.DisplayOrder).ToListAsync(ct);
        if (!categories.Any(x => x.Products.Any())) throw new InvalidOperationException("Agrega al menos una categoría activa con productos activos antes de generar el menú.");

        var activeFont = await db.BusinessPdfFonts.SingleOrDefaultAsync(x => x.BusinessID == businessId && x.IsActive, ct);
        var fontFamily = "Arial";
        if (activeFont is not null)
        {
            fontFamily = $"BusinessFont-{activeFont.Id:N}";
            if (RegisteredFonts.TryAdd(activeFont.Id, 0))
            {
                try
                {
                    await using var fontData = await storage.OpenAsync(activeFont.FileUrl, ct) ?? throw new InvalidOperationException("No fue posible abrir la fuente activa.");
                    FontManager.RegisterFontWithCustomName(fontFamily, fontData);
                }
                catch
                {
                    RegisteredFonts.TryRemove(activeFont.Id, out _);
                    throw;
                }
            }
        }
        var settings = PdfSettings.From(template);
        var visuals = await PdfVisuals.LoadAsync(environment.ContentRootPath, storage, template, ct, coverBackgroundOverride, innerPageBackgroundOverride);
        var bytes = Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(settings.PageSize);
                page.Margin(settings.Margin);
                page.DefaultTextStyle(x => x.FontFamily(fontFamily).FontSize(settings.BodyFontSize).FontColor(settings.TextColor));
                if (visuals.InteriorBackground is not null) page.Background().Layers(layers =>
                {
                    layers.Layer().Background("#e2e7e9");
                    // Full-bleed artwork must occupy the entire page, even if its
                    // aspect ratio differs slightly from the selected paper size.
                    layers.PrimaryLayer().Image(visuals.InteriorBackground).FitUnproportionally();
                });
                // The brand header acts as a cover: it should introduce the menu once,
                // not consume space or repeat on every continuation page.
                // Uploaded title artwork is a 3:1 banner. Give it enough vertical space
                // to render at full page width instead of shrinking it to fit 112 points.
                page.Header().ShowOnce().Height(visuals.HeaderBackground is null ? 32 : 200).Layers(layers =>
                {
                    // The title background is a horizontal banner. Fit it to the full
                    // page width so it reaches both edges of the PDF header.
                    if (visuals.HeaderBackground is not null) layers.Layer().Image(visuals.HeaderBackground).FitUnproportionally();
                    // Keep the logo/title row compact and vertically centered over the banner.
                    var content = layers.PrimaryLayer()
                        .PaddingHorizontal(18)
                        .PaddingTop(visuals.HeaderBackground is null ? 0 : 10)
                        .AlignMiddle()
                        .AlignCenter()
                        .Shrink();
                    content.Column(header =>
                    {
                        // Do not request Bold/SemiBold: a single uploaded .ttf often has no
                        // matching weight and the renderer would silently substitute it.
                        header.Item().AlignCenter().Text(business.Name).FontSize(visuals.HeaderBackground is null ? settings.HeaderFontSize * 1.5f : Math.Max(settings.HeaderFontSize + 9, 27) * 1.5f).FontColor(visuals.HeaderBackground is null ? settings.AccentColor : "#17110f");
                        if (visuals.HeaderBackground is not null) header.Item().PaddingTop(5).AlignCenter().Text("MENÚ").LetterSpacing(2).FontSize(12).FontColor("#17110f");
                    });
                });
                page.Content().Column(column =>
                {
                    column.Spacing(settings.ProductSpacing * 1.5f);
                    foreach (var category in categories.Where(c => c.Products.Any()))
                    {
                        var products = category.Products.OrderBy(p => p.DisplayOrder).ToList();
                        var minimumCategorySpace = settings.TitleTopSpacing + settings.CategoryFontSize + settings.ProductSpacing + settings.MinProductBlockHeight;
                        column.Item().EnsureSpace(minimumCategorySpace).Column(section =>
                        {
                            section.Spacing(settings.ProductSpacing);
                            section.Item().PaddingTop(settings.TitleTopSpacing).Text(category.Name).FontSize(settings.CategoryFontSize * 1.1f).FontColor(visuals.UsesGothicTheme ? "#17110f" : settings.AccentColor);
                            if (!string.IsNullOrWhiteSpace(category.Description)) section.Item().Text(category.Description).FontColor(settings.MutedColor);
                            foreach (var product in products)
                            {
                                section.Item().EnsureSpace(settings.MinProductBlockHeight).PaddingTop(4).Column(block =>
                                {
                                    block.Item().Row(row =>
                                    {
                                        row.RelativeItem().Text(product.Name).FontSize((settings.BodyFontSize + 1) * 1.82f);
                                        // Prices should remain the primary scan target in the menu;
                                        // render them at 200% of the body size (a 100% increase).
                                        row.ConstantItem(78).PaddingTop(6).AlignRight().Text($"${product.Price:N2}").FontSize(settings.BodyFontSize * 2);
                                    });
                                    if (!string.IsNullOrWhiteSpace(product.Description)) block.Item().Text(product.Description).FontSize(settings.BodyFontSize * 1.4f).FontColor(settings.MutedColor);
                                });
                            }
                        });
                    }
                });
                page.Footer().AlignCenter().Text(text => { text.Span($"{business.Name} · "); text.CurrentPageNumber(); });
            });
        }).GeneratePdf();

        var version = await NextVersion(businessId, ct);
        // The admin flow exposes one actionable draft at a time. Archive any older
        // pending drafts so publishing always targets the PDF just generated.
        var previousDrafts = await db.BusinessPdfDocuments
            .Where(x => x.BusinessID == businessId && x.Status == DocumentStatus.Draft)
            .ToListAsync(ct);
        foreach (var draft in previousDrafts)
        {
            draft.Status = DocumentStatus.Archived;
            draft.ArchivedAt = DateTime.UtcNow;
        }
        var key = await storage.SaveAsync(new MemoryStream(bytes), $"{business.Slug}-v{version}.pdf", "application/pdf", ct);
        var entity = new BusinessPdfDocument { Id = Guid.NewGuid(), BusinessID = businessId, Version = version, FileUrl = key, OriginalFileName = $"{business.Slug}.pdf", SourceType = DocumentSourceType.Generated, FileSize = bytes.Length, CreatedByUserId = userId };
        db.BusinessPdfDocuments.Add(entity);
        await db.SaveChangesAsync(ct);
        log.LogInformation("PDF draft generated for {BusinessID}: {DocumentID}, template {TemplateId}", businessId, entity.Id, template.Id);
        return entity;
    }

    sealed record PdfVisuals(byte[]? HeaderBackground, byte[]? InteriorBackground, bool UsesGothicTheme)
    {
        public static async Task<PdfVisuals> LoadAsync(string contentRoot, IFileStorage storage, BusinessPdfTemplate template, CancellationToken ct, string? coverOverride = null, string? interiorOverride = null)
        {
            async Task<byte[]?> Read(string? relativePath)
            {
                if (string.IsNullOrWhiteSpace(relativePath)) return null;
                var path = Path.Combine(contentRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(path)) return await File.ReadAllBytesAsync(path, ct);
                await using var stream = await storage.OpenAsync(relativePath, ct);
                if (stream is null) return null;
                using var buffer = new MemoryStream(); await stream.CopyToAsync(buffer, ct); return buffer.ToArray();
            }
            var headerAsset = coverOverride ?? (template.CoverBackgroundUrl?.EndsWith("header-v1.png", StringComparison.OrdinalIgnoreCase) == true ? "Assets/ViudaNegra/header-v2.png" : template.CoverBackgroundUrl);
            var interiorAsset = interiorOverride ?? (template.InnerPageBackgroundUrl?.EndsWith("interior-v1.png", StringComparison.OrdinalIgnoreCase) == true || template.InnerPageBackgroundUrl?.EndsWith("interior-v2.png", StringComparison.OrdinalIgnoreCase) == true ? "Assets/ViudaNegra/interior-v3.png" : template.InnerPageBackgroundUrl);
            var header = await Read(headerAsset); var interior = await Read(interiorAsset);
            return new PdfVisuals(header, interior, header is not null && interior is not null);
        }
    }

    async Task<int> NextVersion(Guid businessId, CancellationToken ct) => (await db.BusinessPdfDocuments.Where(x => x.BusinessID == businessId).MaxAsync(x => (int?)x.Version, ct) ?? 0) + 1;

    public async Task PublishAsync(Guid businessId, Guid documentId, Guid userId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var document = await db.BusinessPdfDocuments.SingleOrDefaultAsync(x => x.Id == documentId && x.BusinessID == businessId, ct) ?? throw new KeyNotFoundException();
        if (document.Status != DocumentStatus.Draft) throw new InvalidOperationException("Solo se puede publicar un borrador.");
        await using var file = await storage.OpenAsync(document.FileUrl, ct);
        if (file is null) throw new InvalidOperationException("No encontramos el archivo de este borrador. Genera uno nuevo antes de publicarlo.");
        var previousDocuments = await db.BusinessPdfDocuments.Where(x => x.BusinessID == businessId && x.Status == DocumentStatus.Published).ToListAsync(ct);
        foreach (var item in previousDocuments) { item.Status = DocumentStatus.Archived; item.ArchivedAt = DateTime.UtcNow; }
        document.Status = DocumentStatus.Published; document.PublishedAt = DateTime.UtcNow;
        var business = await db.Businesses.SingleAsync(x => x.Id == businessId, ct); business.PublishedPdfDocumentId = document.Id;
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = userId, BusinessID = businessId, Action = "PublishPdf", EntityType = "BusinessPdfDocument", EntityId = document.Id.ToString() });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }

    sealed record PdfSettings(PageSize PageSize, float Margin, float BodyFontSize, float HeaderFontSize, float CategoryFontSize, float ProductSpacing, float TitleTopSpacing, float MinProductBlockHeight, string TextColor, string AccentColor, string MutedColor)
    {
        public static PdfSettings From(BusinessPdfTemplate template)
        {
            var layout = Read(template.LayoutConfigurationJson);
            var colors = Read(template.ColorConfigurationJson);
            var pageSize = template.PageSize.Equals("Letter", StringComparison.OrdinalIgnoreCase) ? PageSizes.Letter : PageSizes.A4;
            var hasGothicVisuals = !string.IsNullOrWhiteSpace(template.CoverBackgroundUrl) && !string.IsNullOrWhiteSpace(template.InnerPageBackgroundUrl);
            if (!hasGothicVisuals && template.Orientation.Equals("Landscape", StringComparison.OrdinalIgnoreCase)) pageSize = pageSize.Landscape();
            return new PdfSettings(pageSize, Number(layout, "margins", 42), Number(layout, "bodyFontSize", 10), Number(layout, "headerFontSize", 18), Number(layout, "categoryFontSize", 25), Number(layout, "productSpacing", 10), Number(layout, "titleTopSpacing", 20), Number(layout, "minProductBlockHeight", 34), Color(colors, "textColor", Colors.Black), Color(colors, "accentColor", Colors.Black), Color(colors, "mutedColor", Colors.Grey.Darken1));
        }
        static JsonElement Read(string json) { try { using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json); return doc.RootElement.Clone(); } catch { using var doc = JsonDocument.Parse("{}"); return doc.RootElement.Clone(); } }
        static float Number(JsonElement root, string name, float fallback) => root.TryGetProperty(name, out var value) && value.TryGetSingle(out var number) && number > 0 ? number : fallback;
        static string Color(JsonElement root, string name, string fallback) { if (!root.TryGetProperty(name, out var value)) return fallback; var color = value.GetString(); return !string.IsNullOrWhiteSpace(color) && System.Text.RegularExpressions.Regex.IsMatch(color, "^#?[0-9a-fA-F]{6}$") ? color : fallback; }
    }
}
