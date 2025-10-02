import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'security', 'dependency-allowlist.json');

async function loadConfig() {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read allowlist at ${configPath}:`, error);
    process.exit(1);
  }
}

async function loadPackageJson(absolutePath) {
  try {
    const raw = await fs.readFile(absolutePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${absolutePath}:`, error);
    process.exit(1);
  }
}

async function loadNpmPackageArg() {
  try {
    const module = await import('npm-package-arg');
    return module.default ?? module;
  } catch {
    const pnpmStore = path.join(projectRoot, 'node_modules', '.pnpm');

    try {
      const entries = await fs.readdir(pnpmStore);
      const match = entries.find((entry) => entry.startsWith('npm-package-arg@'));

      if (match) {
        const candidate = path.join(pnpmStore, match, 'node_modules', 'npm-package-arg');
        const require = createRequire(import.meta.url);
        return require(candidate);
      }
    } catch {}

    console.error('Unable to load npm-package-arg. Add it as a direct devDependency in this workspace.');
    process.exit(1);
  }
}

function collectSpecs(pkgJson, field, packageName) {
  const container = pkgJson[field];
  if (!container || typeof container !== 'object') {
    return [];
  }

  const entries = [];

  const walk = (currentName, value) => {
    if (typeof value === 'string') {
      entries.push({ field, name: currentName, spec: value, packageName });
      return;
    }

    if (value && typeof value === 'object') {
      for (const [nestedName, nestedValue] of Object.entries(value)) {
        const nextName = currentName ? `${currentName} > ${nestedName}` : nestedName;
        walk(nextName, nestedValue);
      }
    }
  };

  for (const [depName, depSpec] of Object.entries(container)) {
    walk(depName, depSpec);
  }

  return entries;
}

function buildExceptionMap(exceptions, defaultAllowedTypes) {
  const map = new Map();

  if (!Array.isArray(exceptions)) {
    return map;
  }

  for (const entry of exceptions) {
    if (!entry || typeof entry !== 'object' || !entry.name) {
      continue;
    }

    map.set(entry.name, {
      allowedTypes: new Set(entry.allowedTypes ?? defaultAllowedTypes),
      allowNonRegistry: entry.allowNonRegistry ?? false,
    });
  }

  return map;
}

(async () => {
  const config = await loadConfig();
  const npa = await loadNpmPackageArg();
  const packageRoots = Array.isArray(config.packageRoots) ? config.packageRoots : ['.'];
  const allowedTypes = new Set(
    Array.isArray(config.allowedTypes)
      ? config.allowedTypes
      : ['version', 'range', 'tag', 'workspace'],
  );
  const disallowNonRegistry = config.disallowNonRegistry !== false;
  const allowWorkspaceWildcard = config.allowWorkspaceWildcard !== false;
  const exceptionMap = buildExceptionMap(config.exceptions, allowedTypes);

  const violationMessages = [];

  for (const relativeRoot of packageRoots) {
    const packageRoot = path.resolve(projectRoot, relativeRoot);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const pkgJson = await loadPackageJson(packageJsonPath);
    const packageName = pkgJson.name ?? `(unnamed package at ${relativeRoot})`;

    const fieldsToCheck = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
      'resolutions',
      'overrides',
    ];

    const specs = fieldsToCheck.flatMap((field) => collectSpecs(pkgJson, field, packageName));

    for (const { field, name, spec } of specs) {
      let parsed;

      try {
        parsed = npa(spec);
      } catch (error) {
        violationMessages.push(
          `${packageName}: could not parse spec for "${name}" in "${field}" -> "${spec}": ${error.message}`,
        );
        continue;
      }

      const exception = exceptionMap.get(name);
      const typesForEntry = exception?.allowedTypes ?? allowedTypes;

      if (!typesForEntry.has(parsed.type)) {
        violationMessages.push(
          `${packageName}: disallowed npm-package-arg type "${parsed.type}" for "${name}" in "${field}" -> "${spec}"`,
        );
        continue;
      }

      if (parsed.type === 'workspace') {
        if (!allowWorkspaceWildcard && parsed.fetchSpec === '*') {
          violationMessages.push(
            `${packageName}: workspace wildcard "${name}" in "${field}" -> "${spec}" is not permitted`,
          );
        }
        continue;
      }

      const registryAllowed = parsed.registry !== false;
      const allowNonRegistry = exception?.allowNonRegistry ?? false;

      if (disallowNonRegistry && !registryAllowed && !allowNonRegistry) {
        violationMessages.push(
          `${packageName}: non-registry reference for "${name}" in "${field}" -> "${spec}" is not allowlisted`,
        );
        continue;
      }
    }
  }

  if (violationMessages.length > 0) {
    console.error('Dependency allowlist violations found:');
    for (const message of violationMessages) {
      console.error(` - ${message}`);
    }
    process.exit(1);
  }

  console.log('Dependency allowlist check passed.');
})();
