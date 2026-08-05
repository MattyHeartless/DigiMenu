# Migraciones

La primera migración se genera desde el modelo EF Core incluido, para mantenerla alineada con la versión instalada del SDK .NET:

```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

Ejecutar ambos comandos con las variables de entorno de `.env` cargadas. No incluir credenciales en archivos de configuración ni en la migración.
