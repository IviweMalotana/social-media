using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage;

namespace SocialMedia.Api.Infrastructure;

public static class MigrationBootstrap
{
    /// <summary>
    /// Applies pending migrations. If the schema pre-dates migrations (created by
    /// EnsureCreated: tables exist, no history), records InitialCreate as applied
    /// first so Migrate() doesn't try to re-create existing tables.
    /// </summary>
    public static void Apply(DbContext db, ILogger logger)
    {
        var creator = db.GetService<IRelationalDatabaseCreator>();
        var history = db.GetService<IHistoryRepository>();

        if (creator.Exists() && creator.HasTables() && !db.Database.GetAppliedMigrations().Any())
        {
            var baseline = db.Database.GetMigrations().First(); // InitialCreate
            logger.LogWarning(
                "Existing schema without migrations history detected — baselining {Migration}.",
                baseline);
            db.Database.ExecuteSqlRaw(history.GetCreateIfNotExistsScript());
            db.Database.ExecuteSqlRaw(history.GetInsertScript(
                new HistoryRow(baseline, ProductInfo.GetVersion())));
        }

        var pending = db.Database.GetPendingMigrations().ToList();
        if (pending.Count > 0)
            logger.LogInformation("Applying {Count} migration(s): {Names}", pending.Count, string.Join(", ", pending));
        db.Database.Migrate();
    }
}
