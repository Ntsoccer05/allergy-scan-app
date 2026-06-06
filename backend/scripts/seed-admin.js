"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const client_1 = require("@prisma/client");
async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@allergy-scan.dev';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!supabaseUrl || !serviceRoleKey || !adminPassword) {
        throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_PASSWORD が必要です');
    }
    const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const prisma = new client_1.PrismaClient();
    try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: adminEmail,
            password: adminPassword,
            app_metadata: { role: 'admin' },
            email_confirm: true,
        });
        if (error)
            throw error;
        const userId = data.user.id;
        const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: 'free' } });
        await prisma.$transaction([
            prisma.user.create({ data: { id: userId } }),
            prisma.userSubscription.create({
                data: { userId, planId: freePlan.id, status: 'active' },
            }),
        ]);
        console.log(`✅ Admin ユーザー作成完了: ${adminEmail} (${userId})`);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch(err => {
    console.error('❌ seed-admin 失敗:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-admin.js.map