// Removes aps-environment from iOS entitlements after expo-notifications injects it.
// Re-add "aps-environment" to app.json ios.entitlements (or delete this plugin)
// once you have a paid Apple Developer account and a Push Notifications provisioning profile.
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
