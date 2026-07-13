using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Services;

public record GeneratedVariant(string Platform, string Caption, List<string> Hashtags);

public record PersonalizedEmail(string Subject, string Body);

/// <summary>
/// AI caption generation via the Claude API. Configured with Anthropic:ApiKey
/// (Railway: Anthropic__ApiKey); model defaults to claude-opus-4-8 and can be
/// overridden with Anthropic:Model. Uses structured outputs so the response is
/// guaranteed-parseable JSON — no brittle text scraping.
/// </summary>
public sealed class ContentGenerator
{
    private readonly AnthropicClient? _client;
    private readonly string _model;

    public ContentGenerator(IConfiguration config)
    {
        var apiKey = config["Anthropic:ApiKey"];
        _client = string.IsNullOrEmpty(apiKey) ? null : new AnthropicClient { ApiKey = apiKey };
        _model = config["Anthropic:Model"] is { Length: > 0 } model ? model : "claude-opus-4-8";
    }

    public bool IsConfigured => _client is not null;

    public async Task<List<GeneratedVariant>> GenerateAsync(
        string topic,
        string tone,
        IReadOnlyList<Domain.Platform> platforms,
        int variantsPerPlatform,
        CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var platformNotes = string.Join("\n", platforms.Select(p =>
        {
            var spec = PlatformCatalog.Specs[p];
            return $"- {spec.Platform}: max {spec.MaxCaptionLength} characters." + p switch
            {
                Domain.Platform.Instagram => " Engaging first line (feed truncates early), emojis welcome, 3-8 hashtags.",
                Domain.Platform.Facebook => " Conversational, minimal hashtags (0-2), a question or CTA performs well.",
                Domain.Platform.TikTok => " Short punchy hook, native/informal voice, 3-5 hashtags.",
                Domain.Platform.Pinterest => " Searchable keyword-rich description; first line may be a destination URL if provided.",
                Domain.Platform.WhatsApp => " Direct message to an opted-in customer; personal tone, one clear CTA, no hashtags.",
                _ => "",
            };
        }));

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 4096,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You are an expert social media copywriter for small businesses. " +
                     "You write captions that sound human and native to each platform — never generic marketing sludge. " +
                     "Respect every platform's character limit strictly.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Write {variantsPerPlatform} caption variant(s) for each platform below.

                        Topic / what we're posting about: {topic}
                        Tone: {tone}

                        Platforms and their rules:
                        {platformNotes}

                        Each variant must fit its platform's limit including hashtags. Hashtags go in
                        the hashtags array without the # symbol, not in the caption text.
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            variants = new
                            {
                                type = "array",
                                items = new
                                {
                                    type = "object",
                                    properties = new
                                    {
                                        platform = new { type = "string" },
                                        caption = new { type = "string" },
                                        hashtags = new { type = "array", items = new { type = "string" } },
                                    },
                                    required = new[] { "platform", "caption", "hashtags" },
                                    additionalProperties = false,
                                },
                            },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(new[] { "variants" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);

        var variants = new List<GeneratedVariant>();
        foreach (var item in doc.RootElement.GetProperty("variants").EnumerateArray())
        {
            variants.Add(new GeneratedVariant(
                item.GetProperty("platform").GetString() ?? "",
                item.GetProperty("caption").GetString() ?? "",
                [.. item.GetProperty("hashtags").EnumerateArray().Select(h => h.GetString() ?? "")]));
        }
        return variants;
    }

    /// <summary>
    /// Polishes one merged outreach draft: fills [bracketed personalization] spots
    /// using ONLY the facts we hold on the prospect — never invented specifics. If the
    /// facts aren't enough, the bracket stays and the send guard keeps a human in the
    /// loop. Everything lands in the review queue regardless.
    /// </summary>
    public async Task<PersonalizedEmail> PersonalizeEmailAsync(
        string subject, string body,
        string companyName, string contactName, string segment, string city, string country,
        string? notes, CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 2048,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You polish cold outreach emails for a small South African packaging supplier. " +
                     "You are truthful above all: you never invent facts, reviews, awards, product names, " +
                     "or anything not present in the provided prospect facts.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Below is one outreach email draft. Your only job:

                        1. If it contains a [bracketed placeholder], replace it with one genuine,
                           specific-feeling line built ONLY from the prospect facts given. If the
                           facts are too thin to write something honest, replace it with a
                           SHORTER bracketed note telling the human reviewer what to add,
                           e.g. "[add one line about their property]".
                        2. Leave everything else essentially unchanged — same offer, same
                           structure, same sign-off, same length. Do not add new claims.

                        Prospect facts (the ONLY facts you may use):
                        - Company: {companyName}
                        - Contact: {(string.IsNullOrWhiteSpace(contactName) ? "(unknown)" : contactName)}
                        - Segment: {segment}
                        - City: {(string.IsNullOrWhiteSpace(city) ? "(unknown)" : city)}
                        - Market: {country}
                        - Research notes: {(string.IsNullOrWhiteSpace(notes) ? "(none)" : notes)}

                        Subject: {subject}

                        Body:
                        {body}
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            subject = new { type = "string" },
                            body = new { type = "string" },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(new[] { "subject", "body" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);
        return new PersonalizedEmail(
            doc.RootElement.GetProperty("subject").GetString() ?? subject,
            doc.RootElement.GetProperty("body").GetString() ?? body);
    }
}
