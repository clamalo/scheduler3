import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut,
    setPersistence,
    browserSessionPersistence,
    indexedDBLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

// script.js

const firebaseConfig = {
    apiKey: "AIzaSyC2BVISsDKOA7IGS-9TXfL6HIKDcxF5w1k",
    authDomain: "project-manager-3-prod.firebaseapp.com",
    databaseURL: "https://project-manager-3-prod-default-rtdb.firebaseio.com", // Add this line
    projectId: "project-manager-3-prod",
    storageBucket: "project-manager-3-prod.firebasestorage.app",
    messagingSenderId: "943851094602",
    appId: "1:943851094602:web:14132a5b2ab15e26061cb3",
    measurementId: "G-9J2N6L5MK8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Configure auth for Safari compatibility
auth.settings = {
    appVerificationDisabledForTesting: false, // Ensure proper security
    persistence: true // Enable persistence
};

// Try both session and indexedDB persistence
const setupPersistence = async () => {
    try {
        // Try indexedDB first
        await setPersistence(auth, indexedDBLocalPersistence);
    } catch (e) {
        console.log("Falling back to session persistence");
        try {
            // Fall back to session persistence
            await setPersistence(auth, browserSessionPersistence);
        } catch (e) {
            console.error("Could not set up persistence:", e);
        }
    }
};

setupPersistence();

const database = getDatabase(app);

// Task class to represent each task
class Task {
    constructor(id, name, depth = 0, parentId = null) {
        this.id = id;
        this.name = name;
        this.depth = depth;
        this.parentId = parentId;
        this.collapsed = false;  // Add this line
    }
}

// Main App
const App = (() => {
    let tasks = []; // Array to hold all tasks
    let currentParentId = null; // To track if adding a subtask
    let editingTaskId = null; // Add this line to track which task is being edited
    let currentUser = null;

    // DOM Elements
    const addTaskButton = document.getElementById('add-task-button');
    const taskModal = document.getElementById('task-modal');
    const closeButton = document.querySelector('.close-button');
    const createTaskButton = document.getElementById('create-task-button');
    const taskNameInput = document.getElementById('task-name-input');
    const tasksContainer = document.getElementById('tasks-container');
    const modalTitle = document.getElementById('modal-title');
    const signInButton = document.getElementById('sign-in-button');

    // Initialize App
    const init = () => {
        // Add auth state listener
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            if (user) {
                signInButton.textContent = 'Sign Out';
                signInButton.classList.add('signed-in');
                loadTasks();
            } else {
                signInButton.textContent = 'Sign in with Google';
                signInButton.classList.remove('signed-in');
                tasks = [];
                renderTasks();
            }
        });

        // Event Listeners
        signInButton.addEventListener('click', handleAuth);
        addTaskButton.addEventListener('click', () => openModal());
        closeButton.addEventListener('click', closeModal);
        window.addEventListener('click', outsideClick);
        createTaskButton.addEventListener('click', createTask);
    };

    const handleAuth = async () => {
        if (currentUser) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Sign out error:", error);
            }
        } else {
            try {
                const provider = new GoogleAuthProvider();
                // Configure provider for Safari
                provider.setCustomParameters({
                    prompt: 'select_account',
                    // Force re-consent to ensure proper cookie handling
                    auth_type: 'rerequest'
                });
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Sign in error:", error);
                alert("Sign in failed. Please try again.");
            }
        }
    };

    // Modified loadTasks
    const loadTasks = () => {
        if (!currentUser) return;
        
        const tasksRef = ref(database, `users/${currentUser.uid}/tasks`);
        onValue(tasksRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Convert Firebase data back to Task objects
                tasks = Object.values(data).map(taskData => {
                    return new Task(
                        taskData.id,
                        taskData.name,
                        taskData.depth,
                        taskData.parentId
                    );
                });
            } else {
                tasks = [];
            }
            renderTasks();
        });
    };

    // Modified saveTasks
    const saveTasks = () => {
        if (!currentUser) return;
        
        // Create a clean object for Firebase
        const tasksObject = {};
        tasks.forEach(task => {
            tasksObject[task.id] = {
                id: task.id,
                name: task.name,
                depth: task.depth,
                parentId: task.parentId,
                collapsed: task.collapsed
            };
        });
        
        const tasksRef = ref(database, `users/${currentUser.uid}/tasks`);
        set(tasksRef, tasksObject).catch(error => {
            console.error("Error saving tasks:", error);
        });
    };

    // Open Modal
    const openModal = (parentId = null, taskToEdit = null) => {
        taskModal.style.display = 'block';
        currentParentId = parentId;
        
        if (taskToEdit) {
            editingTaskId = taskToEdit.id;
            modalTitle.textContent = 'Edit Task';
            taskNameInput.value = taskToEdit.name;
            createTaskButton.textContent = 'Save'; // Add this line
        } else {
            editingTaskId = null;
            modalTitle.textContent = parentId ? 'Add Subtask' : 'Add Task';
            taskNameInput.value = '';
            createTaskButton.textContent = 'Create'; // Add this line
        }
    };

    // Close Modal
    const closeModal = () => {
        taskModal.style.display = 'none';
        currentParentId = null;
    };

    // Click outside modal to close
    const outsideClick = (e) => {
        if (e.target == taskModal) {
            closeModal();
        }
    };

    // Add this new function before createTask
    const expandParentTask = (parentId) => {
        const parentTask = tasks.find(task => task.id === parentId);
        if (parentTask) {
            parentTask.collapsed = false;
            saveTasks();
        }
    };

    // Create Task or Subtask
    const createTask = () => {
        const name = taskNameInput.value.trim();
        if (name === '') {
            alert('Task name cannot be empty.');
            return;
        }

        if (editingTaskId) {
            // Edit existing task
            const taskToEdit = tasks.find(t => t.id === editingTaskId);
            if (taskToEdit) {
                taskToEdit.name = name;
            }
        } else {
            // Create new task
            const id = Date.now();
            let depth = 0;
            if (currentParentId) {
                const parentTask = tasks.find(task => task.id === currentParentId);
                if (parentTask) {
                    depth = parentTask.depth + 1;
                }
            }
            const newTask = new Task(id, name, depth, currentParentId);
            tasks.push(newTask);
            if (currentParentId) {
                expandParentTask(currentParentId);
            }
        }

        saveTasks();
        renderTasks();
        closeModal();
    };

    // Render all tasks
    const renderTasks = () => {
        tasksContainer.innerHTML = '';
        // Filter tasks with no parent (master tasks)
        const masterTasks = tasks.filter(task => task.parentId === null);
        masterTasks.forEach(task => {
            const taskElement = createTaskElement(task);
            tasksContainer.appendChild(taskElement);
        });
    };

    // Helper function to get parent name
    const getParentName = (task) => {
        if (!task.parentId) return "none";
        const parent = tasks.find(t => t.id === task.parentId);
        return parent ? parent.name : "none";
    };

    // Helper function to get children names
    const getChildrenNames = (taskId) => {
        const children = tasks.filter(t => t.parentId === taskId);
        return children.length ? children.map(c => c.name).join(", ") : "none";
    };

    // Create Task DOM Element
    const createTaskElement = (task) => {
        const taskDiv = document.createElement('div');
        taskDiv.classList.add('task');
        
        // Add depth-specific class
        const depthClass = task.depth >= 3 ? 'depth-3plus' : `depth-${task.depth}`;
        taskDiv.classList.add(depthClass);

        // Task Header
        const taskHeader = document.createElement('div');
        taskHeader.classList.add('task-header');

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => deleteTask(task.id));

        // Task Name
        const taskName = document.createElement('span');
        taskName.classList.add('task-name');
        taskName.textContent = `${task.name}`;

        // Add Subtask Button
        const addSubtaskBtn = document.createElement('button');
        addSubtaskBtn.classList.add('add-subtask-button');
        addSubtaskBtn.textContent = '+';
        addSubtaskBtn.addEventListener('click', () => openModal(task.id));

        // Add Edit Button
        const editTaskBtn = document.createElement('button');
        editTaskBtn.classList.add('edit-task-button');
        editTaskBtn.textContent = '✎';
        editTaskBtn.addEventListener('click', () => openModal(null, task));

        // Add Delete Button
        const deleteTaskBtn = document.createElement('button');
        deleteTaskBtn.classList.add('delete-task-button');
        deleteTaskBtn.textContent = '×';
        deleteTaskBtn.addEventListener('click', () => deleteTask(task.id));

        // Append elements to header in new order
        taskHeader.appendChild(checkbox);
        taskHeader.appendChild(taskName);
        taskHeader.appendChild(addSubtaskBtn);
        taskHeader.appendChild(editTaskBtn);
        taskHeader.appendChild(deleteTaskBtn);

        // Append header to task div
        taskDiv.appendChild(taskHeader);

        // Find child tasks
        const childTasks = tasks.filter(t => t.parentId === task.id);

        if (childTasks.length > 0) {
            // Container for subtasks
            const subtasksContainer = document.createElement('div');
            subtasksContainer.classList.add('subtasks');

            // Dropdown indicator
            const dropdownIndicator = document.createElement('div');
            dropdownIndicator.classList.add('dropdown-indicator');
            
            // Set initial state based on saved collapsed state
            if (task.collapsed) {
                subtasksContainer.classList.add('collapsed');
                dropdownIndicator.textContent = `▶ ${childTasks.length} subtask${childTasks.length === 1 ? '' : 's'}`;
            } else {
                dropdownIndicator.textContent = `▼ ${childTasks.length} subtask${childTasks.length === 1 ? '' : 's'}`;
            }

            dropdownIndicator.addEventListener('click', () => {
                if (subtasksContainer.classList.contains('collapsed')) {
                    subtasksContainer.classList.remove('collapsed');
                    dropdownIndicator.textContent = `▼ ${childTasks.length} subtask${childTasks.length === 1 ? '' : 's'}`;
                    task.collapsed = false;  // Add this line
                } else {
                    subtasksContainer.classList.add('collapsed');
                    dropdownIndicator.textContent = `▶ ${childTasks.length} subtask${childTasks.length === 1 ? '' : 's'}`;
                    task.collapsed = true;   // Add this line
                }
                saveTasks();  // Add this line to save state
            });
            taskDiv.appendChild(dropdownIndicator);

            // Render child tasks
            childTasks.forEach(childTask => {
                const childTaskElement = createTaskElement(childTask);
                subtasksContainer.appendChild(childTaskElement);
            });

            // Append subtasks container
            taskDiv.appendChild(subtasksContainer);
        }

        return taskDiv;
    };

    // Delete Task and its Subtasks
    const deleteTask = (id) => {
        // Remove task and its children recursively
        const removeTaskAndChildren = (taskId) => {
            const childTasks = tasks.filter(t => t.parentId === taskId);
            childTasks.forEach(child => removeTaskAndChildren(child.id));
            tasks = tasks.filter(t => t.id !== taskId);
        };

        removeTaskAndChildren(id);
        saveTasks();
        renderTasks();
    };

    // Public API
    return {
        init
    };
})();

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', App.init);