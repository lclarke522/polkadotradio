function logDryRun(items) {
  console.log(`\n🧪 DRY RUN — would have updated playlist with ${items.length} item(s):`);
  items.forEach((item, i) => {
    const name = item.name || item.uri || '(unknown)';
    const artist = item.artist ? ' — ' + item.artist : '';
    console.log(`   ${i + 1}. ${name}${artist}`);
  });
  console.log('\n   (dry run — no changes made to Spotify)\n');
}

module.exports = { logDryRun };