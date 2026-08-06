using DigiMenu.Api.Data;
using DigiMenu.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DigiMenu.Api.Services;

public static class DevelopmentSeeder
{
    public static async Task SeedAsync(this IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DigiMenuDbContext>();
        await db.Database.MigrateAsync();

        var email = configuration["Seed:SuperadminEmail"];
        var password = configuration["Seed:SuperadminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        var business = await db.Businesses.SingleOrDefaultAsync(x => x.Slug == "viuda-negra");
        if (business is null)
        {
            business = new Business
            {
                Id = Guid.NewGuid(), Name = "Viuda Negra", Slug = "viuda-negra", BusinessType = "Restaurante y bar",
                Address = "Guadalajara, Jalisco", IsActive = true, PublicMenuMode = PublicMenuMode.Animated,
                HasAnimatedMenu = true, AnimatedMenuKey = "viuda-negra-v1"
            };
            db.Businesses.Add(business);
            var pizzas = new Category { Id = Guid.NewGuid(), BusinessID = business.Id, Name = "Pizzas", Description = "De masa artesanal", DisplayOrder = 1 };
            var drinks = new Category { Id = Guid.NewGuid(), BusinessID = business.Id, Name = "Bebidas", DisplayOrder = 2 };
            db.Categories.AddRange(pizzas, drinks);
            db.Products.AddRange(
                new Product { Id = Guid.NewGuid(), BusinessID = business.Id, CategoryId = pizzas.Id, Name = "La Viuda", Description = "Pepperoni, aceituna negra y queso", Price = 189, DisplayOrder = 1 },
                new Product { Id = Guid.NewGuid(), BusinessID = business.Id, CategoryId = pizzas.Id, Name = "Aquelarre", Description = "Jamón serrano, arúgula y miel de chile", Price = 205, DisplayOrder = 2 },
                new Product { Id = Guid.NewGuid(), BusinessID = business.Id, CategoryId = drinks.Id, Name = "Limonada de la casa", Description = "Limón, hierbabuena y un toque de magia", Price = 55, DisplayOrder = 1 },
                new Product { Id = Guid.NewGuid(), BusinessID = business.Id, CategoryId = drinks.Id, Name = "Tónica lunar", Description = "Agua tónica, cítricos y romero", Price = 68, DisplayOrder = 2 });
            db.BusinessPdfTemplates.Add(new BusinessPdfTemplate { Id = Guid.NewGuid(), BusinessID = business.Id, Name = "Viuda Negra v1", Status = TemplateStatus.Approved, IsActive = true, LayoutConfigurationJson = "{\"categoryStartsNewPage\":true}", CreatedFromAI = false, ApprovedAt = DateTime.UtcNow });
        }

        if (!await db.Users.AnyAsync(x => x.Email == email))
        {
            var user = new AppUser { Id = Guid.NewGuid(), Email = email, DisplayName = "Superadministrador", PasswordHash = "" };
            user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password);
            db.Users.Add(user);
            db.UserBusinesses.Add(new UserBusiness { Id = Guid.NewGuid(), UserId = user.Id, BusinessID = business.Id, Role = Role.Superadmin });
        }
        await db.SaveChangesAsync();
    }
}
