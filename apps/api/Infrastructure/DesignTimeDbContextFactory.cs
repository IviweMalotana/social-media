using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SocialMedia.Api.Infrastructure;

/// <summary>
/// Used only by `dotnet ef` at design time (generating migrations). The connection
/// string is never opened for migration generation — it just selects the Npgsql
/// provider so migrations are generated with Postgres SQL.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=socialmedia;Username=postgres;Password=postgres")
            .Options;
        return new AppDbContext(options);
    }
}
