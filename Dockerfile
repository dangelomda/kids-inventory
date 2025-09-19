# Usa a imagem do Nginx para servir arquivos estáticos
FROM nginx:alpine

# Remove os arquivos padrão do nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia seus arquivos para a pasta pública do nginx
COPY . /usr/share/nginx/html

# Expõe a porta 80 (padrão HTTP)
EXPOSE 80

# Comando padrão do nginx
CMD ["nginx", "-g", "daemon off;"]
