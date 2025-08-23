// ============================================
//  index.js - 离线版核心逻辑
// ============================================

import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
// 导入我们新的数据库助手
import * as db from './db.js';

const extensionName = "My-SillyTavern-Stories";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// --- 全局变量 ---
let allStories = []; // 这将是从数据库加载的剧本索引
let currentStory = null;

// ============================================
//  【核心修改】数据加载逻辑
// ============================================

async function initStoryLibrary() {
    try {
        allStories = await db.getAllStories();
        // 按创建时间（ID中的时间戳）排序，最新的在前面
        allStories.sort((a, b) => (b.id.split('-')[1] || 0) - (a.id.split('-')[1] || 0));
        
        if (allStories.length === 0) {
            $("#library_tag_container").html('<p>您的剧本库是空的。请在扩展设置中导入数据包，或点击“创建”按钮添加新剧本。</p>');
            $("#library_story_list_container").empty();
            return;
        }
        renderTags();
        handleSearchAndFilter();
    } catch (error) {
        console.error("小剧场库: 加载本地数据库失败!", error);
        $("#library_tag_container").html(`<p>加载数据库失败: ${error.message}</p>`);
    }
}

async function loadStory(storyId, returnStory = false) {
    try {
        const storyContent = await db.getStory(storyId);
        if (!storyContent) {
            throw new Error(`ID为 ${storyId} 的剧本未在数据库中找到。`);
        }
        currentStory = storyContent;
        displayStoryContent();
        if (returnStory) return currentStory;
    } catch (error) {
        console.error("小剧场库: 加载剧本失败", error);
        $("#library_story_content").text(`加载剧本内容失败: ${error.message}`);
        if (returnStory) return null;
    }
}

// ============================================
//  【核心修改】本地数据操作逻辑
// ============================================

// 打开编辑/创建窗口的函数 (现在服务于本地)
async function openLocalEditModal(storyToEdit = null) {
    if ($("#story_upload_modal_overlay").length > 0) return;
    const uploadHtml = await $.get(`${extensionFolderPath}/upload.html`);
    $("body").append(uploadHtml);

    const isEditing = storyToEdit !== null;
    $("#story_upload_modal_content h3").text(isEditing ? "修改本地剧本" : "创建新的本地剧本");
    $("#submit_upload_btn").text(isEditing ? "确认修改" : "确认创建");

    if (isEditing) {
        $("#upload_title").val(storyToEdit.title);
        $("#upload_author").val(storyToEdit.author);
        $("#upload_tags").val(storyToEdit.tags.join(', '));
        $("#upload_content").val(storyToEdit.content);
    }

    $("#story_upload_close_btn").on("click", () => $("#story_upload_modal_overlay").remove());
    $("#submit_upload_btn").on("click", async () => {
        const title = $("#upload_title").val();
        const content = $("#upload_content").val();
        if (!title || !content) {
            $("#upload_status").text("错误：标题和内容不能为空！").css('color', 'red');
            return;
        }

        $("#upload_status").text("正在保存到本地数据库...");
        
        try {
            const storyData = {
                id: isEditing ? storyToEdit.id : `story-${Date.now()}`,
                title: title,
                author: $("#upload_author").val() || "本地用户",
                tags: $("#upload_tags").val().split(',').map(t => t.trim()).filter(Boolean),
                content: content,
            };

            await db.saveStory(storyData);

            $("#upload_status").text(isEditing ? "修改成功！" : "创建成功！").css('color', 'lightgreen');
            setTimeout(() => {
                $("#story_upload_modal_overlay").remove();
                // 刷新剧本库视图
                closeLibraryModal();
                openLibraryModal();
            }, 1000);
        } catch (error) {
            console.error("保存剧本到数据库失败:", error);
            $("#upload_status").text(`错误：${error.message}`).css('color', 'red');
        }
    });
}

// 删除本地剧本的函数
async function deleteLocalStory(storyToDelete) {
    if (!confirm(`确定要从本地删除剧本 "${storyToDelete.title}" 吗？此操作不可恢复！`)) return;
    try {
        await db.deleteStory(storyToDelete.id);
        toastr.success(`剧本 "${storyToDelete.title}" 已从本地删除。`);
        // 刷新视图
        closeLibraryModal();
        openLibraryModal();
    } catch (error) {
        console.error("删除本地剧本失败:", error);
        alert(`删除失败：${error.message}`);
    }
}

// ============================================
//  【UI 渲染与交互函数 - 少量修改】
// ============================================

function displayStoryContent() { /* ... 此函数无需修改 ... */ }
function renderStoryList(stories) { /* ... 此函数内调用 deleteLocalStory 和 openLocalEditModal ... */ }
function renderTags() { /* ... 此函数无需修改 ... */ }
async function sendTextDirectly(text) { /* ... 此函数无需修改 ... */ }

// `renderStoryList` 需要被修改以调用新的本地函数
function renderStoryList(storiesToRender) {
    const listContainer = $("#library_story_list_container").empty();
    if (storiesToRender.length === 0) {
        listContainer.append('<p>没有找到匹配的剧本。</p>');
        return;
    }
    storiesToRender.forEach(storyData => {
        const item = $('<div class="library-story-item"></div>');
        const title = $('<span></span>').text(storyData.title);
        const actions = $('<div class="story-item-actions"></div>');
        const editBtn = $('<button class="story-item-btn" title="编辑">✏️</button>');
        const deleteBtn = $('<button class="story-item-btn" title="删除">🗑️</button>');

        editBtn.on('click', async (e) => {
            e.stopPropagation();
            // 编辑时，我们直接从 allStories 中获取完整数据，因为我们已经一次性加载了所有
            const fullStory = await db.getStory(storyData.id);
            if (fullStory) {
                openLocalEditModal(fullStory);
            } else { alert("加载剧本内容失败，无法编辑。"); }
        });
        
        deleteBtn.on('click', (e) => {
            e.stopPropagation();
            deleteLocalStory(storyData);
        });

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

// ============================================
//  【插件初始化与主流程】
// ============================================

// ... (loadSettings, onEnableChange, updateToolbarButton, closeLibraryModal 等函数保持不变)
// ... openLibraryModal 只需要修改其内部的按钮事件绑定 ...

async function openLibraryModal() {
    if ($("#story_library_modal_overlay").length > 0) return;
    const modalHtml = await $.get(`${extensionFolderPath}/library.html`);
    $("body").append(modalHtml);
    
    // handleSearchAndFilter 和 renderTags 的定义放在这里
    function handleSearchAndFilter() { /* ... 无需修改 ... */ }
    function renderTags() { /* ... 无需修改 ... */ }

    $("#story_library_close_btn").on("click", closeLibraryModal);
    $("#story_library_modal_overlay").on("click", function(event) { if (event.target === this) closeLibraryModal(); });
    $("#story_search_input").on('input', handleSearchAndFilter);
    // 【核心修改】“上传”按钮现在打开本地创建模态框
    $("#open_upload_modal_btn").on("click", () => openLocalEditModal(null));
    $("#library_send_btn").on("click", () => {
        if (currentStory && currentStory.content) {
            sendTextDirectly(currentStory.content);
            closeLibraryModal();
        } else { alert("请先从左侧列表中选择一个剧本！"); }
    });
    
    await initStoryLibrary();
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);
        // 不再需要底部工具栏
        // const toolbarHtml = ...

        $("#enable_story_library").on("input", onEnableChange);
        // 【核心修改】主入口改为左侧扩展菜单
        function addLibraryButtonToExtensionsMenu() {
            const extensionsMenu = $('#extensionsMenu');
            if (extensionsMenu.length > 0 && $('#story_library_in_extension_menu_btn').length === 0) {
                const menuButtonHtml = `
                    <div id="story_library_in_extension_menu_btn" class="list-group-item flex-container flexGap5 interactable">
                        <div class="fa-solid fa-book-open extensionsMenuExtensionButton"></div>
                        <span>小剧场库 (离线版)</span>
                    </div>`;
                extensionsMenu.append(menuButtonHtml);
                $('#story_library_in_extension_menu_btn').on('click', openLibraryModal);
            }
        }
        addLibraryButtonToExtensionsMenu();
        
        await loadSettings();
        // updateToolbarButton(); // 不再需要

        // ========= 【核心修改：添加 ZIP 导入逻辑】 =========
        $('#import_story_zip_btn').on('click', () => $('#story_zip_importer').click());

        $('#story_zip_importer').on('change', async function(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (!confirm('这将清空您现有的本地剧本库并用压缩包的内容替换，确定要继续吗？')) {
                $(this).val('');
                return;
            }

            toastr.info('正在导入数据包，请稍候...');
            
            try {
                const zip = await JSZip.loadAsync(file);
                const dataFolder = zip.folder('data');
                if (!dataFolder) throw new Error('压缩包中未找到 "data" 文件夹。');

                const indexFile = dataFolder.file('index.json');
                if (!indexFile) throw new Error('压缩包中未找到 "data/index.json"。');
                
                // 清空现有数据库
                await db.clearAllStories();
                toastr.info('旧数据已清空，正在写入新数据...');

                const storiesFiles = dataFolder.folder('stories').file(/.json$/);
                let count = 0;
                for (const storyFile of storiesFiles) {
                    const storyContentStr = await storyFile.async('string');
                    const storyContent = JSON.parse(storyContentStr);
                    await db.saveStory(storyContent);
                    count++;
                }

                toastr.success(`成功导入 ${count} 个剧本！`);

            } catch (error) {
                console.error('导入数据包失败:', error);
                toastr.error(`导入失败: ${error.message}`);
            } finally {
                $(this).val('');
            }
        });

    } catch (error) {
        console.error(`加载插件【${extensionName}】时发生严重错误:`, error);
    }
});
