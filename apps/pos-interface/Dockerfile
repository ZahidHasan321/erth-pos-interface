# Stage 1: Build the environment
# Use a specific Node.js version that Vite requires (e.g., Node 22+)
FROM node:25.1.0-alpine AS development

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies layer
COPY package*.json ./

# Install dependencies (npm i will run inside the container)
RUN npm install

# Copy all project files
COPY . .

# Expose the port Vite runs on (usually 5173 or 3000)
EXPOSE 5173

# Define the command to run the development server
# This will use the Node/npm environment *inside* the container
CMD ["npm", "run", "dev"]
