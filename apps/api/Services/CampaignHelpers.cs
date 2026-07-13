using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Services;

/// <summary>Fills {{firstName}} / {{companyName}} / {{city}} in sequence templates.</summary>
public static class TemplateMerge
{
    public static string Fill(string template, Prospect prospect) => template
        .Replace("{{firstName}}", FirstName(prospect.ContactName))
        .Replace("{{companyName}}", prospect.CompanyName)
        .Replace("{{city}}", string.IsNullOrWhiteSpace(prospect.City) ? "your area" : prospect.City.Trim());

    public static string FirstName(string contactName)
    {
        var first = contactName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault() ?? "";
        return first == "" ? "there" : first;
    }
}

/// <summary>
/// Cold-email send windows per market. The cadence says *when a step is due*; the
/// window says *when it's actually allowed out the door* — the send job only fires
/// inside the window, so a step due Saturday goes out Monday morning.
/// </summary>
public static class SendWindows
{
    public static bool IsOpen(string? country, DateTimeOffset utcNow) =>
        (country ?? "").Trim().ToUpperInvariant() switch
        {
            // Tue–Thu 8:00–10:30am Eastern per the US playbook.
            "US" => InWindow(utcNow, "America/New_York", -5,
                [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday], 8.0, 10.5),
            "UK" or "GB" => InWindow(utcNow, "Europe/London", 0,
                [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday], 8.5, 10.5),
            // Default (ZA and anything else): local business hours, Mon–Fri.
            _ => InWindow(utcNow, "Africa/Johannesburg", 2,
                [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday],
                8.0, 16.5),
        };

    /// <summary>Human description of a market's window, for API responses/UI.</summary>
    public static string Describe(string? country) =>
        (country ?? "").Trim().ToUpperInvariant() switch
        {
            "US" => "Tue–Thu, 8:00–10:30am Eastern",
            "UK" or "GB" => "Tue–Thu, 8:30–10:30am UK",
            _ => "Mon–Fri, 8:00am–4:30pm SAST",
        };

    private static bool InWindow(
        DateTimeOffset utcNow, string timeZoneId, int fallbackUtcOffsetHours,
        DayOfWeek[] days, double startHour, double endHour)
    {
        DateTime local;
        try
        {
            local = TimeZoneInfo.ConvertTimeFromUtc(
                utcNow.UtcDateTime, TimeZoneInfo.FindSystemTimeZoneById(timeZoneId));
        }
        catch (TimeZoneNotFoundException)
        {
            local = utcNow.UtcDateTime.AddHours(fallbackUtcOffsetHours);
        }
        if (!days.Contains(local.DayOfWeek)) return false;
        var hour = local.TimeOfDay.TotalHours;
        return hour >= startHour && hour < endHour;
    }
}
