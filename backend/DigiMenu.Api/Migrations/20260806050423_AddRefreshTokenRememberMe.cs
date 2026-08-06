using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigiMenu.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRefreshTokenRememberMe : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RememberMe",
                table: "RefreshTokens",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RememberMe",
                table: "RefreshTokens");
        }
    }
}
