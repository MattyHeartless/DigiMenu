namespace DigiMenu.Api.Services;

public static class DotEnv
{
    public static IDictionary<string, string?> Read(string contentRoot)
    {
        var path = Path.GetFullPath(Path.Combine(contentRoot, "..", "..", ".env"));
        if (!File.Exists(path)) return new Dictionary<string, string?>();
        return File.ReadLines(path)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#') && line.Contains('='))
            .Select(line => line.Split('=', 2))
            .ToDictionary(parts => parts[0].Trim().Replace("__", ":"), parts => (string?)parts[1].Trim().Trim('"'));
    }
}
