import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "My-SillyTavern-Stories";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ---【请在这里配置你的服务器信息】---
const SERVER_IP = "1.92.112.106"; 
const SECRET_KEY = "qweasd123"; 
// ------------------------------------

const SERVER_URL = `http://${SERVER_IP}`;
const UPLOAD_API_URL = `${SERVER_URL}/api/upload`;

const defaultSettings = {
    enabled: true,
};

// ====================== 【原封不动地使用您验证过的正确逻辑】 ======================
/**
 * 您的、经过验证的、绝对正确的发送函数。
 * 它优先使用 triggerSlash 发送纯文本，失败则回退到模拟输入。
 * @param {string} text - 要发送的纯文本内容。
 */
async function sendTextDirectly(text) {
    if (!text) return;

    // 优先尝试官方的 triggerSlash 函数，这是最正确、最高效的方式。
    if (typeof window.triggerSlash === 'function') {
        console.log("【小剧场库】找到 triggerSlash，正在直接发送文本...");
        await window.triggerSlash(text);
        return;
    }
    
    // 如果在特殊环境（如iframe）中，尝试父窗口的函数
    if (window.parent && typeof window.parent.triggerSlash === 'function') {
        console.log("【小剧场库】找到 parent.triggerSlash，正在直接发送文本...");
        await window.parent.triggerSlash(text);
        return;
    }

    // 如果连官方API都找不到，执行最后的备用方案：模拟输入
    console.error("【小剧场库】致命错误：未找到官方发送函数 triggerSlash！将回退到模拟输入，这可能不稳定。");
    const sendButton = $('#send_but');
    const inputTextArea = $('#send_textarea');
    if (sendButton.length > 0 && inputTextArea.length > 0) {
        const originalText = inputTextArea.val();
        inputTextArea.val(text); // 填入纯文本
        inputTextArea[0].dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { 
            sendButton.click();}, 50);
    }
}
// ============================================================================


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

async function openUploadModal() {
    if ($("#story_upload_modal_overlay").length > 0) return;
    const uploadHtml = await $.get(`${extensionFolderPath}/upload.html`);
    $("body").append(uploadHtml);
    $("#story_upload_close_btn").on("click", () => $("#story_upload_modal_overlay").remove());
    $("#submit_upload_btn").on("click", async () => {
        const payload = { title: $("#upload_title").val(), author: $("#upload_author").val(), tags: $("#upload_tags").val().split(',').map(t => t.trim()).filter(Boolean), content: $("#upload_content").val(), secret: SECRET_KEY, };
        if (!payload.title || !payload.content) { $("#upload_status").text("错误：标题和内容不能为空！").css('color', 'red'); return; }
        $("#upload_status").text("上传中...").css('color', '');
        try {
            const response = await fetch(UPLOAD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (result.success) {
                $("#upload_status").text("上传成功！窗口将在2秒后关闭。").css('color', 'lightgreen');
                setTimeout(() => { $("#story_upload_modal_overlay").remove(); closeLibraryModal(); openLibraryModal(); }, 2000);
            } else { $("#upload_status").text(`错误: ${result.message}`).css('color', 'red'); }
        } catch (error) { console.error("上传失败:", error); $("#upload_status").text("错误：无法连接到API服务器。请检查控制台日志。").css('color', 'red'); }
    });
}

async function openLibraryModal() {
    if ($("#story_library_modal_overlay").length > 0) return;
    const modalHtml = await $.get(`${extensionFolderPath}/library.html`);
    $("body").append(modalHtml);
    let allStories = [];
    let currentStory = null;
    const INDEX_PATH = `${SERVER_URL}/index.json`;
    const STORIES_BASE_PATH = `${SERVER_URL}/stories/`;
    function displayStoryContent() {
        if (!currentStory) return;
        $("#library_story_title").text(currentStory.title);
        $("#library_story_meta").html(`<span>作者: ${currentStory.author}</span> | <span>标签: ${currentStory.tags.join(', ')}</span>`);
        $("#library_story_content").text(currentStory.content);
        $("#library_actions").show();
    }
    async function loadStory(storyId) {
        try {
            const response = await fetch(`${STORIES_BASE_PATH}${storyId}.json`);
            if (!response.ok) throw new Error('Network response was not ok.');
            currentStory = await response.json();
            displayStoryContent();
        } catch (error) { console.error("小剧场库: 加载剧本文件失败", error); $("#library_story_content").text('加载剧本内容失败。'); }
    }
    function renderStoryList(stories) {
        const listContainer = $("#library_story_list_container").empty();
        if (stories.length === 0) { listContainer.append('<p>没有找到匹配的剧本。</p>'); return; }
        stories.forEach(story => {
            const item = $('<div class="library-story-item"></div>').text(story.title);
            item.on('click', function() { $(".library-story-item.active").removeClass('active'); $(this).addClass('active'); loadStory(story.id); });
            listContainer.append(item);
        });
    }
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
            const btn = $('<button class="library-tag-btn"></button>').data('tag', tag).text(tag === 'all' ? '全部' : tag);
            if (tag === 'all') btn.addClass('active');
            btn.on('click', function() { $(".library-tag-btn.active").removeClass('active'); $(this).addClass('active'); handleSearchAndFilter(); });
            tagContainer.append(btn);
        });
    }
    async function initStoryLibrary() {
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
    $("#open_upload_modal_btn").on("click", openUploadModal);
    $("#library_send_btn").on("click", () => {
        if (currentStory && currentStory.content) {
            sendTextDirectly(currentStory.content);
            closeLibraryModal();
        } else { alert("请先从左侧列表中选择一个剧本！"); }
    });
    initStoryLibrary();
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
