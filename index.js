import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "My-SillyTavern-Stories";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ---【请在这里配置你的服务器信息】---
const SERVER_IP = "1.92.112.106"; 
const SECRET_KEY = "qweasd123"; 
// ------------------------------------

const SERVER_URL = `http://${SERVER_IP}`;
const API_BASE_URL = `${SERVER_URL}/api`;
const STORIES_BASE_PATH = `${SERVER_URL}/stories/`; 

const defaultSettings = {
    enabled: true,
};

// --- 全局变量 ---
let allStories = [];
let currentStory = null;

// ====================== 【核心修正】 ======================
// 将 displayStoryContent 函数提升到全局作用域
function displayStoryContent() {
    if (!currentStory) return;
    $("#library_story_title").text(currentStory.title);
    $("#library_story_meta").html(`<span>作者: ${currentStory.author}</span> | <span>标签: ${currentStory.tags.join(', ')}</span>`);
    $("#library_story_content").text(currentStory.content);
    $("#library_actions").css('display', 'flex');
}
// =========================================================

// --- API调用函数 ---
async function apiCall(endpoint, payload) {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, secret: SECRET_KEY })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    return response.json();
}

// 打开编辑/上传窗口的函数
async function openEditModal(storyToEdit = null) {
    if ($("#story_upload_modal_overlay").length > 0) return;
    const uploadHtml = await $.get(`${extensionFolderPath}/upload.html`);
    $("body").append(uploadHtml);
    const isEditing = storyToEdit !== null;
    $("#story_upload_modal_content h3").text(isEditing ? "修改小剧场" : "上传新的小剧场");
    $("#submit_upload_btn").text(isEditing ? "确认修改" : "确认上传");
    if (isEditing) {
        $("#upload_title").val(storyToEdit.title);
        $("#upload_author").val(storyToEdit.author);
        $("#upload_tags").val(storyToEdit.tags.join(', '));
        $("#upload_content").val(storyToEdit.content);
    }
    $("#story_upload_close_btn").on("click", () => $("#story_upload_modal_overlay").remove());
    $("#submit_upload_btn").on("click", async () => {
        const payload = {
            id: isEditing ? storyToEdit.id : undefined,
            title: $("#upload_title").val(),
            author: $("#upload_author").val(),
            tags: $("#upload_tags").val().split(',').map(t => t.trim()).filter(Boolean),
            content: $("#upload_content").val(),
        };
        if (!payload.title || !payload.content) { $("#upload_status").text("错误：标题和内容不能为空！").css('color', 'red'); return; }
        $("#upload_status").text(isEditing ? "修改中..." : "上传中...");
        try {
            const endpoint = isEditing ? 'update' : 'upload';
            const result = await apiCall(endpoint, payload);
            if (result.success) {
                $("#upload_status").text(result.message).css('color', 'lightgreen');
                setTimeout(() => {
                    $("#story_upload_modal_overlay").remove();
                    closeLibraryModal();
                    openLibraryModal();
                }, 1500);
            } else { $("#upload_status").text(`错误: ${result.message}`).css('color', 'red'); }
        } catch (error) { console.error("操作失败:", error); $("#upload_status").text(`错误：${error.message}`).css('color', 'red'); }
    });
}

// 删除剧本的函数
async function deleteStory(storyToDelete) {
    if (!confirm(`确定要删除剧本 "${storyToDelete.title}" 吗？此操作不可恢复！`)) return;
    try {
        const result = await apiCall('delete', { id: storyToDelete.id });
        if (result.success) {
            alert(result.message);
            closeLibraryModal();
            openLibraryModal();
        } else {
            alert(`删除失败: ${result.message}`);
        }
    } catch (error) { console.error("删除失败:", error); alert(`删除失败：${error.message}`); }
}

// renderStoryList 函数现在可以安全地调用全局的 loadStory
function renderStoryList(stories) {
    const listContainer = $("#library_story_list_container").empty();
    if (stories.length === 0) { listContainer.append('<p>没有找到匹配的剧本。</p>'); return; }
    stories.forEach(storyData => {
        const item = $('<div class="library-story-item"></div>');
        const title = $('<span></span>').text(storyData.title);
        const actions = $('<div class="story-item-actions"></div>');
        const editBtn = $('<button class="story-item-btn" title="编辑">✏️</button>');
        const deleteBtn = $('<button class="story-item-btn" title="删除">🗑️</button>');
        editBtn.on('click', async (e) => {
            e.stopPropagation();
            try {
                const fullStory = await loadStory(storyData.id, true);
                if (fullStory) {
                    openEditModal(fullStory);
                } else { alert("加载剧本内容失败，无法编辑。"); }
            } catch (error) { console.error("编辑前加载失败:", error); alert("加载剧本内容失败，无法编辑。"); }
        });
        deleteBtn.on('click', (e) => { e.stopPropagation(); deleteStory(storyData); });
        actions.append(editBtn, deleteBtn);
        item.append(title, actions);
        item.on('click', function() {
            $(".library-story-item.active").removeClass('active');
            $(this).addClass('active');
            loadStory(storyData.id);
        });
        listContainer.append(item);
    });
}

// loadStory 函数现在可以安全地调用全局的 displayStoryContent
async function loadStory(storyId, returnStory = false) {
    try {
        const response = await fetch(`${STORIES_BASE_PATH}${storyId}.json?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Network response was not ok.');
        const storyContent = await response.json();
        const storyIndex = allStories.findIndex(s => s.id === storyId);
        if(storyIndex > -1) {
            allStories[storyIndex] = { ...allStories[storyIndex], ...storyContent };
        }
        currentStory = storyContent;
        displayStoryContent(); // 现在可以安全调用
        if (returnStory) return currentStory;
    } catch (error) { 
        console.error("小剧场库: 加载剧本文件失败", error);
        $("#library_story_content").text('加载剧本内容失败。');
        if (returnStory) return null;
    }
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    Object.assign(extension_settings[extensionName], { ...defaultSettings, ...extension_settings[extensionName] });
    $("#enable_story_library").prop("checked", extension_settings[extensionName].enabled);
}

function onEnableChange() {
    extension_settings[extensionName].enabled = $("#enable_story_library").prop("checked");
    saveSettingsDebounced();
    updateToolbarButton();
}

function updateToolbarButton() {
    $("#story_library_toolbar").toggle(extension_settings[extensionName].enabled);
}

function closeLibraryModal() {
    $("#story_library_modal_overlay").remove();
}

async function openLibraryModal() {
    if ($("#story_library_modal_overlay").length > 0) return;
    const modalHtml = await $.get(`${extensionFolderPath}/library.html`);
    $("body").append(modalHtml);
    
    function handleSearchAndFilter() {
        const searchTerm = $("#story_search_input").val().toLowerCase();
        const activeTag = $(".library-tag-btn.active").data('tag');
        let filteredStories = allStories;
        if (activeTag !== 'all' && activeTag) { filteredStories = filteredStories.filter(s => s.tags.includes(activeTag)); }
        if (searchTerm) { filteredStories = filteredStories.filter(s => s.title.toLowerCase().includes(searchTerm)); }
        renderStoryList(filteredStories);
    }

    function renderTags() {
        const tagContainer = $("#library_tag_container").empty();
        const tags = new Set(['all', ...allStories.flatMap(story => story.tags)]);
        tags.forEach(tag => {
            const btn = $('<button class="library-tag-btn"></button').data('tag', tag).text(tag === 'all' ? '全部' : tag);
            if (tag === 'all') btn.addClass('active');
            btn.on('click', function() { $(".library-tag-btn.active").removeClass('active'); $(this).addClass('active'); handleSearchAndFilter(); });
            tagContainer.append(btn);
        });
    }

    async function initStoryLibrary() {
        const INDEX_PATH = `${SERVER_URL}/index.json`;
        try {
            const response = await fetch(INDEX_PATH + '?t=' + new Date().getTime());
            if (!response.ok) throw new Error('Network response was not ok.');
            allStories = await response.json();
            renderTags();
            handleSearchAndFilter();
        } catch (error) { console.error("小剧场库: 加载 index.json 失败!", error); $("#library_tag_container").html(`<p>加载索引失败。</p>`); }
    }

    $("#story_library_close_btn").on("click", closeLibraryModal);
    $("#story_library_modal_overlay").on("click", function(event) { if (event.target === this) closeLibraryModal(); });
    $("#story_search_input").on('input', handleSearchAndFilter);
    $("#open_upload_modal_btn").on("click", () => openEditModal(null));
    $("#library_send_btn").on("click", () => {
        if (currentStory && currentStory.content) {
            sendTextDirectly(currentStory.content);
            closeLibraryModal();
        } else { alert("请先从左侧列表中选择一个剧本！"); }
    });
    
    await initStoryLibrary();
}

async function sendTextDirectly(text) {
    if (!text) return;
    if (typeof window.triggerSlash === 'function') { await window.triggerSlash(text); return; }
    if (window.parent && typeof window.parent.triggerSlash === 'function') { await window.parent.triggerSlash(text); return; }
    console.error("【小剧场库】致命错误：未找到官方发送函数 triggerSlash！将回退到模拟输入。");
    const sendButton = $('#send_but');
    const inputTextArea = $('#send_textarea');
    if (sendButton.length > 0 && inputTextArea.length > 0) {
        inputTextArea.val(text);
        inputTextArea[0].dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { 
            sendButton.click();
            inputTextArea.val(''); 
            inputTextArea[0].dispatchEvent(new Event('input', { bubbles: true }));
        }, 100); 
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);
        const toolbarHtml = await $.get(`${extensionFolderPath}/toolbar.html`);
        if ($("#qr--bar").length === 0) { $("#send_form").append('<div class="flex-container flexGap5" id="qr--bar"></div>'); }
        $(toolbarHtml).insertAfter("#qr--bar");
        $("#enable_story_library").on("input", onEnableChange);
        $("#open_story_library_btn").on("click", openLibraryModal);
        await loadSettings();
        updateToolbarButton();
    } catch (error) {
        console.error(`加载插件【${extensionName}】时发生严重错误:`, error);
    }
});

