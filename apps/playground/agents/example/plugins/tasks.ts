// @ts-nocheck
// biome-ignore-all lint: reason

// memories/recent-messages.ts
export const recentMessagesMemory = defineMemory("recent-messages")
  .output(({ messages }) => messages.slice(-10))
  .options({ behavior: "blocking", position: { section: "bottom", align: "end" } });

// plugins/tasks.ts
const taskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["todo", "doing", "done"]),
});

const tasksStore = defineStore("tasks").schema({
  tasks: z.array(taskSchema),
});

const currentTaskMemory = defineMemory("current-task")
  .dependencies([tasksStore])
  .output(({ stores }) => {
    const currentTask = stores.tasks.get().find((task) => task.status === "todo");
    return {
      role: "system",
      content: `
        # Current Task: ${currentTask?.name}
        ${currentTask?.description}

        --- 
        Id: ${currentTask?.id}
        Use the \`update-task\` action to update the current task status when done.
      `,
    };
  })
  .options({ position: { section: "bottom", align: "end" } });

const tasksInstructionsMemory = defineMemory("tasks-instructions")
  .dependencies([tasksStore])
  .output(({ stores }) => {
    const tasks = stores.tasks.get();
    return {
      role: "system",
      content: `
      # Tasks
      When performing complex work spanning over multiple turns and interactions with the user, break down 
      the work into tasks, update their status as you progress, until all the tasks are completed.

      For this purpose, you can use the following tools:
      - create-task: Create a new task
      - delete-task: Delete a task
      - update-task: Update a task
      - reset-tasks: Reset the task list

      Tasks will auto-reset when all tasks are completed.

      Here are the current tasks in your task list:
      ${tasks.map((task) => `- ${task.name} (id: ${task.id}) (${task.status})`).join("\n")}
    `,
    };
  })
  .options({ position: { section: "top", align: "start" } });

const createTaskAction = defineAction("create-task")
  .dependencies([tasksStore])
  .description("Create a new task")
  .input({
    name: z
      .string()
      .describe("The name of the task. Be concise, this might be displayed to the user."),
    description: z
      .string()
      .describe("The description of the task. Include all the nuances you want to remember."),
    index: z
      .number()
      .optional()
      .describe("The 0-based index to insert at. Inserted at the end if not provided."),
  })
  .output({ id: z.string().describe("The ID of the created task") })
  .label(({ input }) => `Create task '${input.name}'`)
  .execute(async ({ input, stores }) => {
    const index = input.index ?? stores.tasks.get().length;
    const task = {
      id: newId("task"),
      name: input.name,
      description: input.description,
      status: "todo",
    };
    const tasks = stores.tasks.get();
    stores.tasks.set([...tasks.slice(0, index), task, ...tasks.slice(index)]);
    return { id: task.id };
  });

const deleteTaskAction = defineAction("delete-task")
  .dependencies([tasksStore])
  .description("Delete a task")
  .input({ id: z.string().describe("The ID of the task to delete") })
  .label(
    ({ input, stores }) =>
      `Delete task '${stores.tasks.get().find((task) => task.id === input.id)?.name}'`,
  )
  .execute(async ({ input, stores }) =>
    stores.tasks.set(stores.tasks.get().filter((task) => task.id !== input.id)),
  );

const updateTaskAction = defineAction("update-task")
  .dependencies([tasksStore])
  .description("Update a task. You can use it to update a task status to completed for example.")
  .input({
    id: z.string().describe("The ID of the task to set the status of"),
    status: z
      .enum(["todo", "doing", "done"])
      .optional()
      .describe("The status to set the task to. If not provided, the status will not be updated."),
    name: z
      .string()
      .optional()
      .describe("The name of the task. If not provided, the name will not be updated."),
    description: z
      .string()
      .optional()
      .describe(
        "The description of the task. If not provided, the description will not be updated.",
      ),
  })
  .label(
    ({ input, stores }) =>
      `Update task '${stores.tasks.get().find((task) => task.id === input.id)?.name}'`,
  )
  .execute(async ({ input, stores }) =>
    stores.tasks.set(
      stores.tasks
        .get()
        .map((task) => (task.id === input.id ? { ...task, status: input.status } : task)),
    ),
  );

const resetTasksAction = defineAction("reset-tasks")
  .dependencies([tasksStore])
  .description("Reset the task list")
  .output({ success: z.boolean().describe("Whether the task list was reset successfully") })
  .label("Reset tasks")
  .execute(async ({ stores }) => {
    stores.tasks.set([]);
    return { success: true, message: "Task list reset successfully" };
  });

const resetTasksEffect = defineEffect("reset-tasks")
  .dependencies([tasksStore])
  .onMount(async ({ stores }) => {
    return stores.tasks.onChange(() => {
      const tasks = stores.tasks.get();
      if (tasks.every((t) => t.status === "done")) stores.tasks.set([]);
    });
  });

export const tasksPlugin = definePlugin("tasks")
  .stores([tasksStore])
  .memories([currentTaskMemory, tasksInstructionsMemory])
  .actions([createTaskAction, deleteTaskAction, updateTaskAction, resetTasksAction])
  .effects([resetTasksEffect]);

// agent.ts
import { defineAgent } from "life/define";
import { recentMessagesMemory } from "./memories/recent-messages";
import { tasksPlugin } from "./plugins/tasks";

const myAgent = defineAgent("agent")
  .plugins([tasksPlugin])
  .memories([recentMessagesMemory])
  .config({});

const myAgent2 = defineAgent("agent2").plugins([myAgent]);
