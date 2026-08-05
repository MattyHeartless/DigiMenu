using DigiMenu.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Data;

public class DigiMenuDbContext(DbContextOptions<DigiMenuDbContext> options) : DbContext(options)
{
    public DbSet<Business> Businesses => Set<Business>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserBusiness> UserBusinesses => Set<UserBusiness>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<BusinessPdfTemplate> BusinessPdfTemplates => Set<BusinessPdfTemplate>();
    public DbSet<BusinessPdfFont> BusinessPdfFonts => Set<BusinessPdfFont>();
    public DbSet<BusinessPdfDocument> BusinessPdfDocuments => Set<BusinessPdfDocument>();
    public DbSet<PdfTemplateAnalysis> PdfTemplateAnalyses => Set<PdfTemplateAnalysis>();
    public DbSet<QrConfiguration> QrConfigurations => Set<QrConfiguration>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<Business>().HasIndex(x => x.Slug).IsUnique();
        builder.Entity<AppUser>().HasIndex(x => x.Email).IsUnique();
        builder.Entity<UserBusiness>().HasIndex(x => new { x.UserId, x.BusinessID }).IsUnique();
        builder.Entity<RefreshToken>().HasIndex(x => x.TokenHash).IsUnique();
        builder.Entity<Category>().HasIndex(x => new { x.BusinessID, x.DisplayOrder });
        builder.Entity<Product>().HasIndex(x => new { x.BusinessID, x.CategoryId, x.DisplayOrder });
        builder.Entity<Product>().Property(x => x.Price).HasPrecision(18, 2);
        builder.Entity<BusinessPdfFont>().HasIndex(x => new { x.BusinessID, x.Name }).IsUnique();
        builder.Entity<PdfTemplateAnalysis>().Property(x => x.ConfidenceScore).HasPrecision(5, 2);
        builder.Entity<UserBusiness>().HasOne(x => x.Business).WithMany().HasForeignKey(x => x.BusinessID).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Category>().HasOne<Business>().WithMany(x => x.Categories).HasForeignKey(x => x.BusinessID).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Product>().HasOne(x => x.Category).WithMany(x => x.Products).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RefreshToken>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
