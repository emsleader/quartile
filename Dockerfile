FROM node:22-bookworm-slim
# R for run_statistics (base R + the recommended package 'foreign' for SPSS .sav files)
RUN apt-get update && apt-get install -y --no-install-recommends r-base-core r-cran-foreign && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY core ./core
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev
COPY mcp ./mcp
COPY data ./data
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "--expose-gc", "--max-old-space-size=384", "mcp/server.js", "--http"]
