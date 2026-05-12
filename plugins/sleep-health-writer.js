// Config plugin that adds the SleepHealthWriter native module to the iOS and Android projects.
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ── iOS: copy Swift + ObjC bridge files into the Xcode project ───────────────
function withIosSleepWriter(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const iosDir      = path.join(mod.modRequest.platformProjectRoot);
      const srcDir      = path.join(projectRoot, 'modules', 'sleep-health-writer', 'ios');
      const destDir     = path.join(iosDir, 'SleepHealthWriter');

      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      for (const file of ['SleepHealthWriter.swift', 'SleepHealthWriter.m']) {
        const src  = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, dest);
      }
      return mod;
    },
  ]);
}

// ── Android: add Health Connect WRITE_SLEEP_SESSION permission ───────────────
function withAndroidSleepWriter(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const existing = (manifest['uses-permission'] || []).map(
      p => p.$['android:name']
    );
    const perms = [
      'android.permission.health.WRITE_SLEEP',
    ];
    for (const perm of perms) {
      if (!existing.includes(perm)) {
        manifest['uses-permission'] = [
          ...(manifest['uses-permission'] || []),
          { $: { 'android:name': perm } },
        ];
      }
    }
    return mod;
  });
}

module.exports = (config) => withAndroidSleepWriter(withIosSleepWriter(config));
