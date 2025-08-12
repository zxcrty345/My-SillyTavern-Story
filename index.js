import { API as TavernAPI } from '../../../../script.js'; 

// ====================== 【全局配置区】 ======================
const extensionName = "小剧场库";
const extensionFolderPath = `scripts/extensions/third-party/My-Silly-Tavern-Stories`;

const SERVER_IP = "1.92.112.106"; 
const SECRET_KEY = "qweasd123"; 

const SERVER_URL = `http://${SERVER_IP}`;
const API_BASE_URL = `${SERVER_URL}/api`;
const STORIES_BASE_PATH = `${SERVER_URL}/stories/`; 
// ==========================================================

let allStories = [];
let currentStory = null;

const StoryLibrary = {
    apiCall: async function(endpoint, payload) {
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
    },

    openEditModal: async function(storyToEdit = null) {
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
            if (!payload.title || !payload.content) {
                $("#upload_status").text("错误：标题和内容不能为空！").css('color', 'red');
                return;
            }
            $("#upload_status").text(isEditing ? "修改中..." : "上传中...");
            try {
                const endpoint = isEditing ? 'update' : 'upload';
                const result = await this.apiCall(endpoint, payload);
                if (result.success) {
                    $("#upload_status").text(result.message).css('color', 'lightgreen');
                    setTimeout(() => {
                        $("#story_upload_modal_overlay").remove();
                        this.closeLibraryModal();
                        this.openLibraryModal();
                    }, 1500);
                } else {
                    $("#upload_status").text(`错误: ${result.message}`).css('color', 'red');
                }
            } catch (error) {
                console.error("操作失败:", error);
                $("#upload_status").text(`错误：${error.message}`).css('color', 'red');
            }
        });
    },

    deleteStory: async function(storyToDelete) {
        if (!confirm(`确定要删除剧本 "${storyToDelete.title}" 吗？此操作不可恢复！`)) return;
        try {
            const result = await this.apiCall('delete', { id: storyToDelete.id });
            if (result.success) {
                alert(result.message);
                this.closeLibraryModal();
                this.openLibraryModal();
            } else {
                alert(`删除失败: ${result.message}`);
            }
        } catch (error) {
            console.error("删除失败:", error);
            alert(`删除失败：${error.message}`);
        }
    },

    renderStoryList: function(stories) {
        const listContainer = $("#library_story_list_container").empty();
        if (stories.length === 0) {
            listContainer.append('<p>没有找到匹配的剧本。</p>');
            return;
        }
        stories.forEach(storyData => {
            const item = $('<div class="library-story-item"></div>');
            const title = $('<span></span>').text(storyData.title);
            const actions = $('<div class="story-item-actions"></div>');
            const editBtn = $('<button class="story-item-btn" title="编辑">✏️</button>');
            const deleteBtn = $('<button class="story-item-btn" title="删除">🗑️</button>');
            editBtn.on('click', async (e) => {
                e.stopPropagation();
                try {
                    const fullStory = await this.loadStory(storyData.id, true);
                    if (fullStory) {
                        this.openEditModal(fullStory);
                    } else {
                        alert("加载剧本内容失败，无法编辑。");
                    }
                } catch (error) {
                    console.error("编辑前加载失败:", error);
                    alert("加载剧本内容失败，无法编辑。");
                }
            });
            deleteBtn.on('click', (e) => {
                e.stopPropagation();
                this.deleteStory(storyData);
            });
            actions.append(editBtn, deleteBtn);
            item.append(title, actions);
            item.on('click', () => {
                $(".library-story-item.active").removeClass('active');
                item.addClass('active');
                this.loadStory(storyData.id);
            });
            listContainer.append(item);
        });
    },

    loadStory: async function(storyId, returnStory = false) {
        try {
            const response = await fetch(`${STORIES_BASE_PATH}${storyId}.json?t=${new Date().getTime()}`);
            if (!response.ok) throw new Error('Network response was not ok.');
            const storyContent = await response.json();
            const storyIndex = allStories.findIndex(s => s.id === storyId);
            if(storyIndex > -1) {
                allStories[storyIndex] = { ...allStories[storyIndex], ...storyContent };
            }
            currentStory = storyContent;
            this.displayStoryContent();
            if (returnStory) return currentStory;
        } catch (error) {
            console.error("小剧场库: 加载剧本文件失败", error);
            $("#library_story_content").text('加载剧本内容失败。');
            if (returnStory) return null;
        }
    },

    displayStoryContent: function() {
        if (!currentStory) return;
        $("#library_story_title").text(currentStory.title);
        $("#library_story_meta").html(`<span>作者: ${currentStory.author}</span> | <span>标签: ${currentStory.
