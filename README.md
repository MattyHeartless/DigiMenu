# DigiMenu

Monorepo para la plataforma multi-negocio de menús digitales.

## Estructura

- `backend/DigiMenu.Api`: ASP.NET Core Web API, EF Core y SQL Server.
- `apps/administration`: panel privado de operación.
- `apps/menus`: experiencia pública de cada negocio.

## Variables de entorno

Copiar `.env.example` a `.env` y completar los valores. El API carga este archivo solo para desarrollo local; las credenciales nunca se guardan en el repositorio. Definir `Seed__SuperadminEmail` y `Seed__SuperadminPassword` crea la demostración Viuda Negra y el primer superadministrador al arrancar.

```bash
npm install
npm run dev:admin
npm run dev:menus
```

Para el API se requiere .NET SDK 10 y luego:

```bash
cd backend/DigiMenu.Api
dotnet restore
dotnet ef database update
dotnet run
```

El API toma `ConnectionStrings__DefaultConnection`, `Jwt__Key`, `Kimi__ApiKey` y `Kimi__Model` del entorno. La integración KIMI se usa solo al solicitar un análisis de plantilla; nunca durante la generación normal de PDF.

Un superadministrador selecciona el negocio de trabajo mediante el encabezado `X-Business-ID`; los administradores de negocio siempre lo resuelven desde su JWT.
