using DigiMenu.Api.Data;
using DigiMenu.Api.DTOs;
using DigiMenu.Api.Domain;
using DigiMenu.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/public/businesses")]
public class PublicController(DigiMenuDbContext db, IFileStorage storage) : ControllerBase
{
    [HttpGet("{businessSlug}")]
    public async Task<IResult> Business(string businessSlug)
    {
        var business = await db.Businesses.Where(x => x.Slug == businessSlug && x.IsActive)
            .Select(x => new { x.Id, x.Name, x.Slug, x.LogoUrl, x.PublicMenuMode, x.HasAnimatedMenu, x.AnimatedMenuKey, x.PublishedPdfDocumentId }).SingleOrDefaultAsync();
        return business is null ? Results.NotFound() : Results.Ok(business);
    }

    [HttpGet("{businessSlug}/menu")]
    public async Task<IResult> Menu(string businessSlug)
    {
        var business = await db.Businesses.Include(x => x.Categories).ThenInclude(x => x.Products).SingleOrDefaultAsync(x => x.Slug == businessSlug && x.IsActive);
        if (business is null) return Results.NotFound();
        var categories = business.Categories.Where(c => c.IsActive).OrderBy(c => c.DisplayOrder)
            .Select(c => new PublicCategory(c.Id, c.Name, c.Description, c.DisplayOrder, c.Products.Where(p => p.IsActive && p.IsAvailable).OrderBy(p => p.DisplayOrder).Select(p => new PublicProduct(p.Id, p.Name, p.Description, p.Price, p.DisplayOrder, p.IsAvailable)).ToList()))
            .Where(x => x.Products.Count > 0).ToList();
        return Results.Ok(new PublicMenu(new { id = business.Id, name = business.Name, slug = business.Slug, logoUrl = business.LogoUrl, mode = business.PublicMenuMode.ToString(), hasAnimatedMenu = business.HasAnimatedMenu, animatedMenuKey = business.AnimatedMenuKey }, categories));
    }

    [HttpGet("{businessSlug}/pdf")]
    public async Task<IResult> Pdf(string businessSlug)
    {
        var document = await (from business in db.Businesses join pdf in db.BusinessPdfDocuments on business.PublishedPdfDocumentId equals pdf.Id where business.Slug == businessSlug && business.IsActive && pdf.Status == DocumentStatus.Published select pdf).SingleOrDefaultAsync();
        if (document is null) return Results.NotFound();
        var file = await storage.OpenAsync(document.FileUrl, HttpContext.RequestAborted);
        return file is null ? Results.NotFound() : Results.File(file, "application/pdf", enableRangeProcessing: true);
    }

    [HttpGet("{businessSlug}/logo")]
    public async Task<IResult> Logo(string businessSlug)
    {
        var logoKey = await db.Businesses.Where(x => x.Slug == businessSlug && x.IsActive).Select(x => x.LogoUrl).SingleOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(logoKey)) return Results.NotFound();
        var file = await storage.OpenAsync(logoKey, HttpContext.RequestAborted);
        var extension = Path.GetExtension(logoKey).ToLowerInvariant(); var contentType = extension switch { ".jpg" or ".jpeg" => "image/jpeg", ".webp" => "image/webp", _ => "image/png" };
        return file is null ? Results.NotFound() : Results.File(file, contentType);
    }
}
