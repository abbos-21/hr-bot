import bcrypt from 'bcryptjs';
import prisma from './db';
import { config } from './config';

async function seed() {
  console.log('Seeding database...');

  const existingAdmin = await prisma.admin.findUnique({
    where: { email: config.adminEmail },
  });

  if (!existingAdmin) {
    const hashed = await bcrypt.hash(config.adminPassword, 10);
    const admin = await prisma.admin.create({
      data: {
        email: config.adminEmail,
        password: hashed,
        name: 'Super Admin',
        role: 'super_admin',
      },
    });
    console.log(`Created admin: ${admin.email}`);
  } else {
    console.log(`Admin already exists: ${existingAdmin.email}`);
  }

  await prisma.$disconnect();
  console.log('Seeding complete!');
}

seed().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
