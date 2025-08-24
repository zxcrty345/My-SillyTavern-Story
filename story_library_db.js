// ============================================
//  db.js - IndexedDB 数据库助手
// ============================================

const DB_NAME = 'SillyTavernStoryLibraryDB';
const STORE_NAME = 'stories';
const DB_VERSION = 1;
let db;

// 初始化数据库
export function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject('数据库初始化失败');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('数据库已成功打开');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // 创建一个对象存储空间，使用 'id' 作为主键
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('对象存储空间 "stories" 已创建');
            }
        };
    });
}

// 保存或更新一个剧本
export async function saveStory(story) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(story);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('保存剧本失败: ' + event.target.error);
    });
}

// 获取一个剧本
export async function getStory(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('获取剧本失败: ' + event.target.error);
    });
}

// 获取所有剧本
export async function getAllStories() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('获取所有剧本失败: ' + event.target.error);
    });
}

// 删除一个剧本
export async function deleteStory(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('删除剧本失败: ' + event.target.error);
    });
}

// 清空所有剧本
export async function clearAllStories() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('清空剧本库失败: ' + event.target.error);
    });
}
