// === scripts/check-routes.js ===
require('dotenv').config(); // Ensure environment variables are loade
const fs = require('fs');
const path = require('path');

function checkRoutes() {
    console.log('🔍 Checking Route Conflicts...\n');

    const routesDir = path.join(__dirname, '../routes');
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

    const allRoutes = [];
    const conflicts = [];

    routeFiles.forEach(file => {
        console.log(`📁 Checking ${file}...`);

        try {
            const filePath = path.join(routesDir, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // Extract route paths using regex
            const pathMatches = content.match(/path:\s*['"`]([^'"`]+)['"`]/g);

            if (pathMatches) {
                pathMatches.forEach(match => {
                    const path = match.replace(/path:\s*['"`]([^'"`]+)['"`]/, '$1');

                    const existingRoute = allRoutes.find(r => r.path === path);
                    if (existingRoute) {
                        conflicts.push({
                            path,
                            files: [existingRoute.file, file]
                        });
                    } else {
                        allRoutes.push({ path, file });
                    }
                });
            }

        } catch (error) {
            console.error(`❌ Error reading ${file}:`, error.message);
        }
    });

    console.log(`\n📊 Found ${allRoutes.length} total routes in ${routeFiles.length} files`);

    if (conflicts.length > 0) {
        console.log('\n⚠️ Route Conflicts Found:');
        conflicts.forEach(conflict => {
            console.log(`   Path: ${conflict.path}`);
            console.log(`   Files: ${conflict.files.join(' vs ')}`);
        });
        console.log('\n❌ Please resolve conflicts before proceeding');
    } else {
        console.log('\n✅ No route conflicts detected');
    }

    // Show backup-related routes
    const backupRoutes = allRoutes.filter(r =>
        r.path.includes('/admin/activity-logs') ||
        r.path.includes('/admin/logs') ||
        r.path.includes('backup')
    );

    if (backupRoutes.length > 0) {
        console.log('\n📦 Backup-related routes found:');
        backupRoutes.forEach(route => {
            console.log(`   ${route.path} (${route.file})`);
        });
    }
}

checkRoutes();