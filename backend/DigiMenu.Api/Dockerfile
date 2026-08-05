FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/DigiMenu.Api/DigiMenu.Api.csproj backend/DigiMenu.Api/
RUN dotnet restore backend/DigiMenu.Api/DigiMenu.Api.csproj

COPY backend/DigiMenu.Api/ backend/DigiMenu.Api/
WORKDIR /src/backend/DigiMenu.Api
RUN dotnet publish DigiMenu.Api.csproj --configuration Release --output /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libfontconfig1 \
  && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
ENV HttpsRedirection__Enabled=false
ENV Storage__RootPath=/app/storage

COPY --from=build /app/publish .

# Menús, PDFs, imágenes y fuentes cargadas se conservan fuera de la imagen.
VOLUME ["/app/storage"]
EXPOSE 8080
ENTRYPOINT ["dotnet", "DigiMenu.Api.dll"]
