FROM python:3.11-slim

WORKDIR /app

# Install minimal server for authentication
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://mirror-pypi.runflare.com/simple -r requirements.txt

# Copy all files
COPY . .

# Set environment variables for auth
ENV APP_USER=admin
ENV APP_PASS=admin
ENV PORT=5001

# Expose port
EXPOSE 5001

# Run the authenticated static server
CMD ["python", "static_server.py"]
