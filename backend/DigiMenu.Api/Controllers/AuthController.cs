using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using DigiMenu.Api.Data;
using DigiMenu.Api.DTOs;
using DigiMenu.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace DigiMenu.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(DigiMenuDbContext db, IConfiguration config) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IResult> Login(LoginRequest input)
    {
        var user = await db.Users.Include(x => x.UserBusinesses).ThenInclude(x => x.Business).SingleOrDefaultAsync(x => x.Email == input.Email && x.IsActive);
        if (user is null || new PasswordHasher<AppUser>().VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed) return Results.Unauthorized();
        var membership = user.UserBusinesses.Where(x => x.IsActive && x.Business.IsActive).OrderBy(x => x.CreatedAt).FirstOrDefault(); if (membership is null) return Results.Unauthorized();
        return Results.Ok(await Issue(user, membership));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IResult> Refresh(RefreshRequest input)
    {
        var hash = Hash(input.RefreshToken);
        var current = await db.RefreshTokens.Include(x => x.User).ThenInclude(x => x.UserBusinesses).ThenInclude(x => x.Business).SingleOrDefaultAsync(x => x.TokenHash == hash && x.RevokedAt == null && x.ExpiresAt > DateTime.UtcNow);
        if (current is null || !current.User.IsActive) return Results.Unauthorized();
        var membership = current.User.UserBusinesses.Where(x => x.IsActive && x.Business.IsActive).OrderBy(x => x.CreatedAt).FirstOrDefault(); if (membership is null) return Results.Unauthorized();
        current.RevokedAt = DateTime.UtcNow;
        return Results.Ok(await Issue(current.User, membership));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IResult> Logout(RefreshRequest input)
    {
        var token = await db.RefreshTokens.SingleOrDefaultAsync(x => x.TokenHash == Hash(input.RefreshToken) && x.RevokedAt == null);
        if (token is not null) { token.RevokedAt = DateTime.UtcNow; await db.SaveChangesAsync(); }
        return Results.NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public IResult Me() => Results.Ok(new { userId = User.FindFirstValue(ClaimTypes.NameIdentifier), role = User.FindFirstValue(ClaimTypes.Role), businessId = User.FindFirstValue("BusinessID") });

    async Task<object> Issue(AppUser user, UserBusiness membership)
    {
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Email, user.Email), new Claim(ClaimTypes.Role, membership.Role.ToString()), new Claim("BusinessID", membership.Role == Role.Superadmin ? "" : membership.BusinessID.ToString()) };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"] ?? throw new InvalidOperationException("JWT no configurado")));
        var token = new JwtSecurityToken(config["Jwt:Issuer"], config["Jwt:Audience"], claims, expires: DateTime.UtcNow.AddMinutes(30), signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        var rawRefresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        db.RefreshTokens.Add(new RefreshToken { Id = Guid.NewGuid(), UserId = user.Id, TokenHash = Hash(rawRefresh), ExpiresAt = DateTime.UtcNow.AddDays(14) });
        await db.SaveChangesAsync();
        return new { accessToken = new JwtSecurityTokenHandler().WriteToken(token), refreshToken = rawRefresh, user = new { user.Id, user.Email, role = membership.Role.ToString() }, business = new { membership.Business.Id, membership.Business.Name, membership.Business.Slug } };
    }
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
