using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Buffers.Binary;
using System.IO.Compression;
using Docnet.Core;
using Docnet.Core.Models;

namespace DigiMenu.Api.Services;

public interface IFileStorage { Task<string> SaveAsync(Stream data, string fileName, string contentType, CancellationToken ct); Task<Stream?> OpenAsync(string key, CancellationToken ct); }

public class LocalFileStorage(IWebHostEnvironment env, IConfiguration configuration) : IFileStorage
{
    readonly string root = ResolveRoot(env, configuration["Storage:RootPath"]);

    static string ResolveRoot(IWebHostEnvironment env, string? configuredRoot)
    {
        if (string.IsNullOrWhiteSpace(configuredRoot)) return Path.Combine(env.ContentRootPath, "storage");
        return Path.IsPathFullyQualified(configuredRoot)
            ? configuredRoot
            : Path.Combine(env.ContentRootPath, configuredRoot);
    }

    public async Task<string> SaveAsync(Stream data, string fileName, string contentType, CancellationToken ct) { Directory.CreateDirectory(root); var safe = Path.GetFileName(fileName); var key = $"{Guid.NewGuid():N}-{safe}"; await using var f = File.Create(Path.Combine(root, key)); await data.CopyToAsync(f, ct); return key; }
    public Task<Stream?> OpenAsync(string key, CancellationToken ct) { var path = Path.Combine(root, Path.GetFileName(key)); return Task.FromResult<Stream?>(File.Exists(path) ? File.OpenRead(path) : null); }
}

public interface IKimiTemplateAdvisor { Task<(string suggestion, decimal confidence)> AnalyzeAsync(byte[] referenceBytes, string contentType, string? extractedText, CancellationToken ct); }

public class KimiTemplateAdvisor(IHttpClientFactory clients, IConfiguration config) : IKimiTemplateAdvisor
{
    public async Task<(string, decimal)> AnalyzeAsync(byte[] referenceBytes, string contentType, string? extractedText, CancellationToken ct)
    {
        var key = config["Kimi:ApiKey"];
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("Kimi:ApiKey no está configurado.");

        var (pdfText, previews) = contentType == "application/pdf"
            ? await ReadReferenceAsync(referenceBytes, ct)
            : (string.Empty, new List<byte[]> { referenceBytes });
        var prompt = """
Eres director de arte de menús de restaurante. Analiza el PDF de referencia y devuelve exclusivamente JSON válido, sin markdown.
Usa este esquema exacto:
{
  "name":"Nombre corto de la plantilla",
  "pageSize":"A4 o Letter",
  "orientation":"Portrait o Landscape",
  "layout":{"margins":42,"bodyFontSize":10,"headerFontSize":18,"categoryFontSize":25,"productSpacing":10,"titleTopSpacing":20,"minProductBlockHeight":34},
  "typography":{"family":"Sans o Serif","tone":"descripción breve"},
  "colors":{"textColor":"#RRGGBB","accentColor":"#RRGGBB","mutedColor":"#RRGGBB"},
  "decoration":{"themeKey":"gothic-marble o none","usesPhotography":true,"style":"descripción breve"}
}
Infiera valores prácticos para un PDF nuevo con productos diferentes. Si la referencia usa marmoleado, telarañas, ornamentos góticos o un encabezado dramático, usa themeKey "gothic-marble". No copies texto, precios ni nombres del menú de referencia.
""";
        var content = new List<object> { new { type = "text", text = $"{prompt}\n\nTexto extraído del PDF:\n{extractedText ?? pdfText}" } };
        var imageType = contentType == "application/pdf" ? "image/png" : contentType;
        foreach (var preview in previews) content.Add(new { type = "image_url", image_url = new { url = $"data:{imageType};base64,{Convert.ToBase64String(preview)}" } });

        var client = clients.CreateClient("kimi");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        var payload = JsonSerializer.Serialize(new { model = config["Kimi:Model"] ?? "kimi-k2.7-code", messages = new[] { new { role = "user", content } }, temperature = 1 });
        using var response = await client.PostAsync("chat/completions", new StringContent(payload, Encoding.UTF8, "application/json"), ct);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var output = json.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "{}";
        return (StripFences(output), .78m);
    }

    static async Task<(string text, List<byte[]> previews)> ReadReferenceAsync(byte[] pdfBytes, CancellationToken ct)
    {
        var text = new StringBuilder(); var previews = new List<byte[]>();
        using var document = DocLib.Instance.GetDocReader(pdfBytes, new PageDimensions(1080));
        for (var pageIndex = 0; pageIndex < Math.Min(document.GetPageCount(), 3); pageIndex++)
        {
            ct.ThrowIfCancellationRequested();
            using var page = document.GetPageReader(pageIndex);
            text.AppendLine(page.GetText());
            previews.Add(ToPng(page.GetImage(), page.GetPageWidth(), page.GetPageHeight()));
        }
        return (text.ToString(), previews);
    }

    static string StripFences(string value) => value.Trim().Replace("```json", "", StringComparison.OrdinalIgnoreCase).Replace("```", "").Trim();

    static byte[] ToPng(byte[] bgra, int width, int height)
    {
        var raw = new byte[height * (width * 4 + 1)];
        for (var y = 0; y < height; y++)
        {
            var rawOffset = y * (width * 4 + 1); raw[rawOffset] = 0;
            for (var x = 0; x < width; x++)
            {
                var source = (y * width + x) * 4; var target = rawOffset + 1 + x * 4;
                raw[target] = bgra[source + 2]; raw[target + 1] = bgra[source + 1]; raw[target + 2] = bgra[source]; raw[target + 3] = bgra[source + 3];
            }
        }
        using var output = new MemoryStream(); output.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var header = new byte[13]; BinaryPrimitives.WriteInt32BigEndian(header, width); BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height); header[8] = 8; header[9] = 6; WriteChunk(output, "IHDR", header);
        using var compressed = new MemoryStream(); using (var zip = new ZLibStream(compressed, CompressionLevel.Fastest, true)) zip.Write(raw); WriteChunk(output, "IDAT", compressed.ToArray()); WriteChunk(output, "IEND", []); return output.ToArray();
    }

    static void WriteChunk(Stream output, string type, byte[] data)
    {
        var typeBytes = Encoding.ASCII.GetBytes(type); Span<byte> length = stackalloc byte[4]; BinaryPrimitives.WriteInt32BigEndian(length, data.Length); output.Write(length); output.Write(typeBytes); output.Write(data);
        uint crc = 0xffffffff; foreach (var value in typeBytes) crc = CrcStep(crc, value); foreach (var value in data) crc = CrcStep(crc, value); Span<byte> checksum = stackalloc byte[4]; BinaryPrimitives.WriteUInt32BigEndian(checksum, ~crc); output.Write(checksum);
    }

    static uint CrcStep(uint crc, byte value) { crc ^= value; for (var bit = 0; bit < 8; bit++) crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1; return crc; }
}
