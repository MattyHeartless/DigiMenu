using DigiMenu.Api.Data;
using DigiMenu.Api.DTOs;
using DigiMenu.Api.Domain;
using DigiMenu.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "RequireBusinessAccess")]
public class AdminConfigurationController(DigiMenuDbContext db, IBusinessAccess access, IFileStorage storage) : ControllerBase
{
    async Task<Guid> Business() => await access.CurrentBusinessId(User);

    [HttpGet("configuration")]
    public async Task<IResult> GetConfiguration()
    {
        var business = await db.Businesses.FindAsync(await Business());
        return business is null ? Results.NotFound() : Results.Ok(new { business.Id, business.Name, business.Slug, business.Address, business.Description, business.OpeningHours, business.LogoUrl, mode = business.PublicMenuMode.ToString(), business.HasAnimatedMenu, business.AnimatedMenuKey });
    }

    [HttpPut("configuration/business-profile")]
    public async Task<IResult> UpdateBusinessProfile(BusinessProfileRequest input)
    {
        var business = await db.Businesses.FindAsync(await Business()); if (business is null) return Results.NotFound();
        if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { message = "El nombre del negocio es obligatorio." });
        business.Name = input.Name.Trim(); business.Address = input.Address?.Trim(); business.Description = input.Description?.Trim(); business.OpeningHours = input.OpeningHours?.Trim(); business.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(); return Results.Ok(new { business.Id, business.Name, business.Slug, business.Address, business.Description, business.OpeningHours, business.LogoUrl });
    }

    [HttpPost("configuration/logo")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IResult> UploadLogo(IFormFile file)
    {
        if (file.Length == 0 || file.Length > 5_000_000 || !new[] { "image/png", "image/jpeg", "image/webp" }.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase)) return Results.BadRequest(new { message = "El logo debe ser PNG, JPG o WebP de hasta 5 MB." });
        var business = await db.Businesses.FindAsync(await Business()); if (business is null) return Results.NotFound();
        business.LogoUrl = await storage.SaveAsync(file.OpenReadStream(), file.FileName, file.ContentType, HttpContext.RequestAborted); business.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(); return Results.Ok(new { logoUrl = business.LogoUrl });
    }

    [HttpPut("configuration/public-menu-mode")]
    public async Task<IResult> UpdatePublicMenuMode(PublishMenuModeRequest input)
    {
        if (!Enum.TryParse<PublicMenuMode>(input.Mode, true, out var mode)) return Results.BadRequest(new { message = "La modalidad debe ser Pdf o Animated." });
        var business = await db.Businesses.FindAsync(await Business()); if (business is null) return Results.NotFound();
        if (mode == PublicMenuMode.Animated && (!business.HasAnimatedMenu || string.IsNullOrWhiteSpace(business.AnimatedMenuKey))) return Results.BadRequest(new { message = "Este negocio no tiene una experiencia animada habilitada." });
        business.PublicMenuMode = mode; business.UpdatedAt = DateTime.UtcNow;
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = access.UserId(User), BusinessID = business.Id, Action = "ChangePublicMenuMode", EntityType = "Business", EntityId = business.Id.ToString(), NewValuesJson = $"{{\"mode\":\"{mode}\"}}" });
        await db.SaveChangesAsync(); return Results.Ok(new { mode = business.PublicMenuMode.ToString() });
    }

    [HttpPost("products/reorder")]
    public async Task<IResult> ReorderProducts(List<ReorderItem> items)
    {
        var businessId = await Business();
        if (items.Count == 0 || items.Select(x => x.Id).Distinct().Count() != items.Count) return Results.BadRequest(new { message = "El orden enviado no es válido." });
        var products = await db.Products.Where(x => x.BusinessID == businessId && items.Select(i => i.Id).Contains(x.Id)).ToListAsync();
        if (products.Count != items.Count) return Results.NotFound();
        foreach (var product in products) product.DisplayOrder = items.Single(x => x.Id == product.Id).DisplayOrder;
        await db.SaveChangesAsync(); return Results.NoContent();
    }
}
