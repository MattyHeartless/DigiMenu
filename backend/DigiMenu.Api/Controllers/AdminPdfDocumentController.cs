using DigiMenu.Api.Data;
using DigiMenu.Api.Domain;
using DigiMenu.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/admin/pdf")]
[Authorize(Policy = "RequireBusinessAccess")]
public class AdminPdfDocumentController(DigiMenuDbContext db, IBusinessAccess access, IFileStorage storage) : ControllerBase
{
    async Task<Guid> Business() => await access.CurrentBusinessId(User);

    [HttpGet("{documentId:guid}/preview")]
    public async Task<IResult> Preview(Guid documentId)
    {
        var businessId = await Business();
        var document = await db.BusinessPdfDocuments.SingleOrDefaultAsync(x => x.Id == documentId && x.BusinessID == businessId);
        if (document is null) return Results.NotFound();
        var file = await storage.OpenAsync(document.FileUrl, HttpContext.RequestAborted);
        return file is null ? Results.NotFound() : Results.File(file, "application/pdf", enableRangeProcessing: true);
    }

    [HttpPost("{documentId:guid}/archive")]
    public async Task<IResult> Archive(Guid documentId)
    {
        var businessId = await Business();
        var document = await db.BusinessPdfDocuments.SingleOrDefaultAsync(x => x.Id == documentId && x.BusinessID == businessId);
        if (document is null) return Results.NotFound();
        if (document.Status == DocumentStatus.Archived) return Results.NoContent();
        document.Status = DocumentStatus.Archived; document.ArchivedAt = DateTime.UtcNow;
        var business = await db.Businesses.FindAsync(businessId);
        if (business?.PublishedPdfDocumentId == documentId) business.PublishedPdfDocumentId = null;
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = access.UserId(User), BusinessID = businessId, Action = "ArchivePdf", EntityType = "BusinessPdfDocument", EntityId = documentId.ToString() });
        await db.SaveChangesAsync(); return Results.NoContent();
    }
}
