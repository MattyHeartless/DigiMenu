using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigiMenu.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessPdfFonts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BusinessPdfFonts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    FileUrl = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessPdfFonts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessPdfFonts_BusinessID_Name",
                table: "BusinessPdfFonts",
                columns: new[] { "BusinessID", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessPdfFonts");
        }
    }
}
