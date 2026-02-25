#!/bin/bash
set -e

echo "🚀 Setting up HR Recruitment Bot System..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "📝 Created .env file - please configure it!"
    echo ""
    echo "Required settings:"
    echo "  JWT_SECRET=<random-secret>"
    echo "  ADMIN_EMAIL=your@email.com"
    echo "  ADMIN_PASSWORD=your-password"
fi

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
npm install

# Generate Prisma client
echo ""
echo "🔧 Setting up database..."
npx prisma generate
npx prisma migrate dev --name init

# Seed database
echo ""
echo "🌱 Seeding database..."
npx ts-node src/seed.ts

# Install admin panel dependencies
echo ""
echo "📦 Installing admin panel dependencies..."
cd admin && npm install && cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  Backend:     npm run dev"
echo "  Admin panel: cd admin && npm run dev"
echo ""
echo "Default admin credentials:"
grep ADMIN_EMAIL .env || echo "  Email: admin@example.com"
grep ADMIN_PASSWORD .env || echo "  Password: admin123"
echo ""
echo "📌 Backend runs on: http://localhost:3000"
echo "📌 Admin panel runs on: http://localhost:5173"
