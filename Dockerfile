# Builds the API from the repo root — so the Railway service works whether its
# Root Directory is set to apps/api (uses apps/api/Dockerfile) or left at the
# repo root (uses this one). Same runtime behavior either way.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY apps/api/SocialMedia.Api.csproj apps/api/
RUN dotnet restore apps/api/SocialMedia.Api.csproj
COPY apps/api/ apps/api/
RUN dotnet publish apps/api/SocialMedia.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
# Railway injects PORT; default to 8080 for local docker runs.
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} dotnet SocialMedia.Api.dll"]
