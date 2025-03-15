const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Read the base manifest
const baseManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8')
);

// Define browser-specific overrides
const browserOverrides = {
  chrome: {
    background: {
      service_worker: "scripts/background.js"
    }
  },
  firefox: {
    background: {
      scripts: ["scripts/background.js"]
    }
  }
};

// Create zip archive for a browser build
function createZipArchive(browser, version) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Starting to create zip for ${browser}...`);
      
      // Create dist-zip directory if it doesn't exist
      const zipDir = path.join(__dirname, '../dist-zip');
      if (!fs.existsSync(zipDir)) {
        fs.mkdirSync(zipDir, { recursive: true });
      }
      
      const outputPath = path.join(zipDir, `ssp-wallet-${browser}-${version}.zip`);
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Listen for all archive data to be written
      output.on('close', () => {
        try {
          console.log(`${browser} extension has been zipped: ${archive.pointer()} total bytes`);
          resolve();
        } catch (error) {
          console.error(`Error in output close handler for ${browser}:`, error);
          reject(error);
        }
      });

      // Good practice to catch warnings (ie stat failures and other non-blocking errors)
      archive.on('warning', (err) => {
        try {
          if (err.code === 'ENOENT') {
            console.warn(`Warning while creating ${browser} zip:`, err);
          } else {
            reject(err);
          }
        } catch (error) {
          console.error(`Error in warning handler for ${browser}:`, error);
          reject(error);
        }
      });

      // Good practice to catch this error explicitly
      archive.on('error', (err) => {
        try {
          console.error(`Error creating ${browser} zip:`, err);
          reject(err);
        } catch (error) {
          console.error(`Error in error handler for ${browser}:`, error);
          reject(error);
        }
      });

      // Pipe archive data to the file
      archive.pipe(output);
      
      console.log(`Creating ${browser} zip...`);
      
      try {
        // For Firefox, we need to create a temporary manifest
        if (browser === 'firefox') {
          console.log('Creating temporary Firefox directory...');
          // Create a temporary directory for Firefox
          const tempDir = path.join(__dirname, '../dist/temp-firefox');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          console.log('Copying files to temporary Firefox directory...');
          // Copy all files from dist to temp directory
          copyFiles(
            path.join(__dirname, '../dist'),
            tempDir,
            ['temp-firefox'] // Exclude temp directory itself
          );
          
          console.log('Creating Firefox manifest...');
          // Create Firefox manifest
          const firefoxManifest = deepMerge(baseManifest, browserOverrides.firefox);
          fs.writeFileSync(
            path.join(tempDir, 'manifest.json'),
            JSON.stringify(firefoxManifest, null, 2)
          );
          
          console.log('Adding Firefox files to archive...');
          // Add files from temp directory to archive
          archive.directory(tempDir, false);
        } else {
          console.log('Adding Chrome files to archive...');
          // For Chrome, use the dist directory directly
          archive.directory(path.join(__dirname, '../dist'), false);
        }
      } catch (error) {
        console.error(`Error preparing files for ${browser}:`, error);
        reject(error);
        return;
      }
      
      console.log(`Finalizing ${browser} zip...`);
      try {
        archive.finalize();
      } catch (error) {
        console.error(`Error finalizing archive for ${browser}:`, error);
        reject(error);
      }
    } catch (error) {
      console.error(`Unexpected error in createZipArchive for ${browser}:`, error);
      reject(error);
    }
  });
}

// Generate manifests for each browser
async function buildManifests(browsers = ['chrome', 'firefox']) {
  try {
    const version = baseManifest.version;
    
    console.log('Starting build process...');
    
    try {
      // Always use Chrome manifest for the dist folder
      const chromeManifest = deepMerge(baseManifest, browserOverrides.chrome);
      fs.writeFileSync(
        path.join(__dirname, '../dist/manifest.json'),
        JSON.stringify(chromeManifest, null, 2)
      );
      
      console.log('Generated Chrome manifest for dist folder');
    } catch (error) {
      console.error('Error generating Chrome manifest:', error);
    }
    
    // Create zip archives for each browser
    for (const browser of browsers) {
      console.log(`Processing ${browser}...`);
      try {
        await createZipArchive(browser, version);
        console.log(`Generated zip for ${browser}`);
      } catch (error) {
        console.error(`Error creating zip for ${browser}:`, error);
      }
    }
    
    // Clean up temporary Firefox directory if it exists
    try {
      const tempFirefoxDir = path.join(__dirname, '../dist/temp-firefox');
      if (fs.existsSync(tempFirefoxDir)) {
        console.log('Cleaning up temporary Firefox directory...');
        fs.rmSync(tempFirefoxDir, { recursive: true, force: true });
        console.log('Cleaned up temporary Firefox directory');
      }
    } catch (error) {
      console.error('Error cleaning up temporary Firefox directory:', error);
    }
    
    console.log('Build process completed successfully!');
  } catch (error) {
    console.error('Error in build process:', error);
    throw error;
  }
}

// Helper function for deep merging objects
function deepMerge(target, source) {
  try {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        try {
          if (isObject(source[key])) {
            if (!(key in target)) {
              Object.assign(output, { [key]: source[key] });
            } else {
              output[key] = deepMerge(target[key], source[key]);
            }
          } else {
            Object.assign(output, { [key]: source[key] });
          }
        } catch (error) {
          console.error(`Error merging key ${key}:`, error);
          // Continue with other keys
        }
      });
    }
    
    return output;
  } catch (error) {
    console.error('Error in deepMerge:', error);
    return target; // Return original if merge fails
  }
}

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

// Copy files from source to destination, excluding specified directories
function copyFiles(source, destination, excludeDirs = []) {
  try {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      try {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          copyFiles(srcPath, destPath, excludeDirs);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      } catch (error) {
        console.error(`Error copying file ${entry.name}:`, error);
        // Continue with other files
      }
    }
  } catch (error) {
    console.error('Error in copyFiles:', error);
  }
}

// If script is run directly
if (require.main === module) {
  const browsers = process.argv.slice(2);
  buildManifests(browsers.length > 0 ? browsers : ['chrome', 'firefox'])
    .catch(err => {
      console.error('Error building manifests:', err);
      process.exit(1);
    });
}

module.exports = { buildManifests };