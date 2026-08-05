using DigiMenu.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace DigiMenu.Api.Data;

// Keeps Entity Framework tooling from starting the web host (and its development seeder).
public sealed class DigiMenuDbContextFactory : IDesignTimeDbContextFactory<DigiMenuDbContext>
{
    public DigiMenuDbContext CreateDbContext(string[] args)
    {
        var contentRoot = Directory.GetCurrentDirectory();
        var configuration = new ConfigurationBuilder()
            .SetBasePath(contentRoot)
            .AddJsonFile("appsettings.json", optional: true)
            .AddInMemoryCollection(DotEnv.Read(contentRoot))
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión predeterminada.");

        return new DigiMenuDbContext(
            new DbContextOptionsBuilder<DigiMenuDbContext>()
                .UseSqlServer(connectionString)
                .Options);
    }
}
