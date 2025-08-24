// ============================================
//  story_library_main.js - 离线版 v3.2 (新增导入模式和导出功能)
// ============================================

const extensionName = "My-SillyTavern-Story";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (src.includes('story_library_db.js')) {
            script.type = 'module';
        }
        script.src = `/${extensionFolderPath}/${src}`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`无法加载脚本: ${src}`));
        document.head.appendChild(script);
    });
}

async function main() {
    const { extension_settings, getContext, loadExtensionSettings } = await import("../../../extensions.js");
    const { saveSettingsDebounced } = await import("../../../../script.js");
    const db = await import('./story_library_db.js');

    // --- 全局变量 ---
    let allStories = [];
    let currentStory = null;
    let currentImportMode = 'append'; // 'append' 或 'replace'

    // --- 数据存储 ---
    function getStoryDataStore() {
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = {};
        }
        return extension_settings[extensionName];
    }

    // --- 核心数据加载与操作 ---
    async function initStoryLibrary() {
        try {
            allStories = await db.getAllStories();
            allStories.sort((a, b) => (b.id.split('-')[1] || 0) - (a.id.split('-')[1] || 0));
            if (allStories.length === 0) {
                $("#library_tag_container").html('<p>您的剧本库是空的。请在扩展设置中导入数据包，或点击“创建”按钮添加新剧本。</p>');
                $("#library_story_list_container").empty().append('<p>列表为空</p>');
                renderTags();
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
            if (!storyContent) throw new Error(`ID为 ${storyId} 的剧本未在数据库中找到。`);
            currentStory = storyContent;
            displayStoryContent();
            if (returnStory) return currentStory;
        } catch (error) {
            $("#library_story_content").text(`加载剧本内容失败: ${error.message}`);
            if (returnStory) return null;
        }
    }

    async function openLocalEditModal(storyToEdit = null) {
        if ($("#story_upload_modal_overlay").length > 0) return;
        const uploadHtml = await $.get(`/${extensionFolderPath}/story_library_upload.html`);
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
                    closeLibraryModal();
                    openLibraryModal();
                }, 1000);
            } catch (error) {
                $("#upload_status").text(`错误：${error.message}`).css('color', 'red');
            }
        });
    }

    async function deleteLocalStory(storyToDelete) {
        if (!confirm(`确定要从本地删除剧本 "${storyToDelete.title}" 吗？此操作不可恢复！`)) return;
        try {
            await db.deleteStory(storyToDelete.id);
            toastr.success(`剧本 "${storyToDelete.title}" 已从本地删除。`);
            closeLibraryModal();
            openLibraryModal();
        } catch (error) {
            alert(`删除失败：${error.message}`);
        }
    }

    // --- UI 渲染与辅助函数 ---
    let handleSearchAndFilter;
    
    function displayStoryContent() {
        if (!currentStory) return;
        $("#library_story_title").text(currentStory.title);
        $("#library_story_meta").html(`<span>作者: ${currentStory.author}</span> | <span>标签: ${currentStory.tags.join(', ')}</span>`);
        $("#library_story_content").text(currentStory.content);
        $("#library_actions").css('display', 'flex');
    }

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
                const fullStory = await db.getStory(storyData.id);
                if (fullStory) openLocalEditModal(fullStory);
                else alert("加载剧本内容失败，无法编辑。");
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

    function renderTags() {
        const tagContainer = $("#library_tag_container").empty();
        const tags = new Set(['all', ...allStories.flatMap(story => story.tags || [])]);
        tags.forEach(tag => {
            const btn = $('<button class="library-tag-btn"></button').data('tag', tag).text(tag === 'all' ? '全部' : tag);
            if (tag === 'all') btn.addClass('active');
            btn.on('click', function() {
                $(".library-tag-btn.active").removeClass('active');
                $(this).addClass('active');
                handleSearchAndFilter();
            });
            tagContainer.append(btn);
        });
    }

    async function sendTextDirectly(text) {
        if (!text) return;
        if (typeof window.triggerSlash === 'function') { await window.triggerSlash(text); return; }
        if (window.parent && typeof window.parent.triggerSlash === 'function') { await window.parent.triggerSlash(text); return; }
        const sendButton = $('#send_but');
        const inputTextArea = $('#send_textarea');
        if (sendButton.length > 0 && inputTextArea.length > 0) {
            inputTextArea.val(text);
            inputTextArea[0].dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => { sendButton.click(); }, 50);
        }
    }

    function closeLibraryModal() {
        $("#story_library_modal_overlay").remove();
    }

    async function openLibraryModal() {
        if ($("#story_library_modal_overlay").length > 0) return;
        const modalHtml = await $.get(`/${extensionFolderPath}/story_library_library.html`);
        $("body").append(modalHtml);
        handleSearchAndFilter = function() {
            const searchTerm = $("#story_search_input").val().toLowerCase();
            const activeTag = $(".library-tag-btn.active").data('tag');
            let filteredStories = allStories;
            if (activeTag !== 'all' && activeTag) {
                filteredStories = filteredStories.filter(s => s.tags && s.tags.includes(activeTag));
            }
            if (searchTerm) {
                filteredStories = filteredStories.filter(s => s.title.toLowerCase().includes(searchTerm));
            }
            renderStoryList(filteredStories);
        }
        $("#story_library_close_btn").on("click", closeLibraryModal);
        $("#story_library_modal_overlay").on("click", function(event) { if (event.target === this) closeLibraryModal(); });
        $("#story_search_input").on("input", handleSearchAndFilter);
        $("#open_upload_modal_btn").on("click", () => openLocalEditModal(null));
        $("#library_send_btn").on("click", () => {
            if (currentStory && currentStory.content) {
                sendTextDirectly(currentStory.content);
                closeLibraryModal();
            } else { alert("请先从左侧列表中选择一个剧本！"); }
        });
        await initStoryLibrary();
    }

    // --- 导入与导出逻辑 ---
    function triggerZipImport(mode) {
        currentImportMode = mode;
        $('#story_zip_importer').click();
    }

    async function handleZipImport(file) {
        if (!file) return;
        const confirmMessage = currentImportMode === 'replace' ? '这将清空您现有的本地剧本库并用压缩包的内容替换，确定要继续吗？' : '这将向您的剧本库中添加新的剧本，确定要继续吗？';
        if (!confirm(confirmMessage)) {
            $('#story_zip_importer').val('');
            return;
        }
        toastr.info('正在处理数据包，请稍候...');
        try {
            const zip = await JSZip.loadAsync(file);
            const dataFolder = zip.folder('data');
            if (!dataFolder) throw new Error('压缩包中未找到 "data" 文件夹。');
            const storiesFiles = dataFolder.folder('stories').file(/.json$/);
            if (storiesFiles.length === 0) throw new Error("压缩包的 'data/stories' 文件夹中没有剧本文件。");

            if (currentImportMode === 'replace') {
                await db.clearAllStories();
                toastr.info('旧数据已清空，正在写入新数据...');
            }

            let addedCount = 0, skippedCount = 0;
            const existingStories = currentImportMode === 'append' ? await db.getAllStories() : [];
            const existingIds = new Set(existingStories.map(s => s.id));
            const existingTitles = new Set(existingStories.map(s => s.title));

            for (const storyFile of storiesFiles) {
                const storyContentStr = await storyFile.async('string');
                const storyContent = JSON.parse(storyContentStr);
                if (currentImportMode === 'append' && (existingIds.has(storyContent.id) || existingTitles.has(storyContent.title))) {
                    skippedCount++;
                    continue;
                }
                await db.saveStory(storyContent);
                addedCount++;
            }
            let successMessage = `成功导入 ${addedCount} 个新剧本！`;
            if (skippedCount > 0) successMessage += `（跳过了 ${skippedCount} 个已存在的剧本）`;
            if (currentImportMode === 'replace') successMessage = `成功导入 ${addedCount} 个剧本！`;
            toastr.success(successMessage);
        } catch (error) {
            toastr.error(`导入失败: ${error.message}`);
        } finally {
            $('#story_zip_importer').val('');
        }
    }

    async function handleZipExport() {
        toastr.info('正在准备导出数据包...');
        try {
            const allStoriesToExport = await db.getAllStories();
            if (allStoriesToExport.length === 0) {
                toastr.warning('您的本地剧本库是空的，无需导出。');
                return;
            }
            const zip = new JSZip();
            const dataFolder = zip.folder("data");
            const storiesFolder = dataFolder.folder("stories");
            const indexData = allStoriesToExport.map(({ id, title, author, tags }) => ({ id, title, author, tags }));
            dataFolder.file("index.json", JSON.stringify(indexData, null, 2));
            allStoriesToExport.forEach(story => {
                storiesFolder.file(`${story.id}.json`, JSON.stringify(story, null, 2));
            });
            toastr.info('正在生成 .zip 文件...');
            const zipContent = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipContent);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
            link.download = `SillyTavern-Stories-Backup-${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            toastr.success('数据包已成功导出并开始下载！');
        } catch (error) {
            toastr.error(`导出失败: ${error.message}`);
        }
    }

    // --- 插件初始化 ---
    jQuery(async () => {
        try {
            const settingsHtml = await $.get(`/${extensionFolderPath}/story_library_settings.html`);
            $("#extensions_settings2").append(settingsHtml);

            function onEnableChange() {
                getStoryDataStore().enabled = $("#enable_story_library").prop("checked");
                saveSettingsDebounced();
            }
            $("#enable_story_library").on("input", onEnableChange);

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
            
            await loadExtensionSettings(extensionName);
            $("#enable_story_library").prop("checked", getStoryDataStore().enabled !== false);
            
            $('#import_story_zip_append_btn').on('click', () => triggerZipImport('append'));
            $('#import_story_zip_replace_btn').on('click', () => triggerZipImport('replace'));
            $('#export_story_zip_btn').on('click', handleZipExport);
            $('#story_zip_importer').on('change', function(event) {
                handleZipImport(event.target.files[0]);
            });
        } catch (error) {
            console.error(`加载插件【${extensionName}】时发生严重错误:`, error);
        }
    });
}

Promise.all([
    loadScript('story_library_jszip.min.js'),
    loadScript('story_library_db.js')
]).then(() => {
    console.log('小剧场库：所有依赖已加载，正在启动插件...');
    main();
}).catch(error => {
    console.error('小剧场库：加载核心依赖失败，插件无法启动。', error);
});
