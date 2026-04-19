const [major] = process.versions.node.split('.').map(Number);
const supportedMajors = new Set([20, 24]);

if (!supportedMajors.has(major)) {
  console.error(
    `Movie Chat supports Node.js 20 LTS and 24 LTS (24 recommended). ` +
    `Current runtime: ${process.versions.node}.`
  );
  process.exit(1);
}
