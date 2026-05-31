const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading database:', err);
  }
  return { workspaces: [] };
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

function initDb() {
  const db = readDb();
  if (db.workspaces.length === 0) {
    db.workspaces = [
      { id: '1', name: 'Project Alpha', language: 'JavaScript', description: 'Main project', createdBy: 'System', creatorId: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: '2', name: 'Project Beta', language: 'Python', description: 'Backend API', createdBy: 'System', creatorId: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: '3', name: 'Design System', language: 'CSS', description: 'UI components', createdBy: 'System', creatorId: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: '4', name: 'Backend API', language: 'Node.js', description: 'REST API', createdBy: 'System', creatorId: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: '5', name: 'Mobile App', language: 'React Native', description: 'iOS/Android', createdBy: 'System', creatorId: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];
    writeDb(db);
    console.log('Database initialized with 5 workspaces');
  }
  return db;
}

function listWorkspaces() {
  return readDb().workspaces;
}

function getWorkspaceById(id) {
  const db = readDb();
  return db.workspaces.find(w => w.id === id);
}

function createWorkspace(data) {
  const db = readDb();
  const newWorkspace = {
    id: Date.now().toString(),
    name: data.name || `Workspace ${db.workspaces.length + 1}`,
    language: data.language || 'JavaScript',
    description: data.description || '',
    createdBy: data.createdBy || 'Anonymous',
    creatorId: data.creatorId || 'anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.workspaces.push(newWorkspace);
  writeDb(db);
  return newWorkspace;
}

function updateWorkspace(id, updates) {
  const db = readDb();
  const index = db.workspaces.findIndex(w => w.id === id);
  if (index === -1) return null;
  
  db.workspaces[index] = {
    ...db.workspaces[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
  return db.workspaces[index];
}

function deleteWorkspace(id) {
  const db = readDb();
  const initialLength = db.workspaces.length;
  db.workspaces = db.workspaces.filter(w => w.id !== id);
  
  if (db.workspaces.length === initialLength) return false;
  
  writeDb(db);
  return true;
}

module.exports = {
  initDb,
  listWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace
};