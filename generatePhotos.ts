import Replicate from "replicate";
import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import readline from "node:readline";
import pAll from 'p-all';

type Step = {
  x: number;
  y: number;
  index: number;
  rotate_yaw: number;
  rotate_pitch: number;
  pupil_x: number;
  pupil_y: number;
  filename: string;
  crop_factor: number;
  output_quality: number;
};

type Setup = {
  X_STEPS: number;
  Y_STEPS: number;
  ROTATE_BOUND: number;
  PUPIL_BOUND: number;
  PHOTO_PREFIX: string;
  FILE_NAME: string;
};

const DEFAULT_GRID_SIZE = 5;
const CONCURRENCY = 5;
let renderedLines = 0;
const gridSize = getGridSizeFromArgs(process.argv[2]);
const exec = promisify(execCallback);

const setup: Setup = {
  X_STEPS: gridSize,
  Y_STEPS: gridSize,
  ROTATE_BOUND: 20,
  PUPIL_BOUND: 13,
  PHOTO_PREFIX: "avatar",
  FILE_NAME: "input/photo.jpeg" // heic will not work here
}

const model = "fofr/expression-editor:bf913bc90e1c44ba288ba3942a538693b72e8cc7df576f3beebe56adc0a92b86";
const steps = generateSteps(setup);
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const image = fs.readFileSync(setup.FILE_NAME);
const __dirname = path.dirname(new URL(import.meta.url).pathname);

const cost = steps.flat().length * 0.00098;
const formatter=new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

console.log(`Generating ${gridSize*gridSize} photos (${gridSize}x${gridSize} grid).\nEstimated cost: ${formatter.format(cost)}`);

const shouldProceed = await promptForConfirmation("Continue with generation?");

if (!shouldProceed) {
  console.log("Aborted by user.");
  process.exit(0);
}

const generatedAll = await generateAllWithRetries(steps.flat());

if (generatedAll) {
  const shouldBuildSprite = await promptForConfirmation("Proceed to create sprite?");
  if (shouldBuildSprite) {
    const spriteSize = await promptForNumber("Sprite cell size in px (default 160): ", 160);
    await createSprite(spriteSize);
  } else {
    logWithNewLine("Sprite creation skipped by user request.");
  }
} else {
  logWithNewLine("Skipping sprite creation because not all images were generated.");
}


async function generate(step: Step) {
  const outputDir = path.join(__dirname, "output");
  const outputPath = path.join(outputDir, step.filename);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const startMessage = `Generating ${step.filename}...`;
  const doneMessage = `Generated ${step.filename} ✅`;
  const skipMessage = `Skipping ${step.filename} (exists)`;
  const lineWidth = Math.max(startMessage.length, doneMessage.length, skipMessage.length);
  const lineIndex = registerLogLine(startMessage, lineWidth);

  // Skip this step if the file already exists
  if (fs.existsSync(outputPath)) {
    updateLogLine(lineIndex, skipMessage, lineWidth);
    return;
  }

  const output = await replicate.run(model, {
    input: {
      image,
      ...step,
    },
  });

  // Replicate may return a single file or an array of files
  const fileOutput = Array.isArray(output) ? output[0] : output;

  if (!fileOutput) {
    throw new Error("No output from Replicate");
  }

  // FileOutput → Blob → ArrayBuffer → Buffer
  const blob = await fileOutput.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await writeFile(outputPath, buffer);
  updateLogLine(lineIndex, doneMessage, lineWidth);
}

function round(value: number, precision: number) {
  return Math.round(value * precision) / precision;
}

async function generateAllWithRetries(stepList: Step[], maxAttempts = 2) {
  let attempt = 1;
  let pending = [...stepList];

  while (pending.length > 0 && attempt <= maxAttempts) {
    if (attempt > 1) {
      logWithNewLine(`Retrying ${pending.length} missing images (attempt ${attempt}/${maxAttempts})...`);
    }

    const actions = pending.map((step) => () => generate(step));
    await pAll(actions, { concurrency: CONCURRENCY });

    pending = pending.filter((step) => !isGenerated(step));
    attempt += 1;
  }

  if (pending.length === 0) {
    logWithNewLine("All images generated successfully.");
    return true;
  }

  const missing = pending.map((step) => step.filename).join(", ");
  console.error(`Could not generate ${pending.length} images after ${maxAttempts} attempts: ${missing}`);
  process.exitCode = 1;
  return false;
}

function isGenerated(step: Step) {
  const outputPath = path.join(__dirname, "output", step.filename);
  return fs.existsSync(outputPath);
}

function padLine(message: string, length: number) {
  return message.padEnd(length, " ");
}

function registerLogLine(message: string, lineWidth: number) {
  const lineIndex = renderedLines;
  renderedLines += 1;
  process.stdout.write(`${padLine(message, lineWidth)}\n`);
  return lineIndex;
}

function updateLogLine(lineIndex: number, message: string, lineWidth: number) {
  const distanceUp = renderedLines - lineIndex;
  const moveUp = distanceUp > 0 ? `\x1b[${distanceUp}A` : "";
  const moveDown = distanceUp > 0 ? `\x1b[${distanceUp}B` : "";
  process.stdout.write(`${moveUp}\r${padLine(message, lineWidth)}${moveDown}\r`);
}

function logWithNewLine(message: string) {
  renderedLines += 1;
  process.stdout.write(`${message}\n`);
}

async function createSprite(cellSize: number) {
  const tile = `${setup.X_STEPS}x${setup.Y_STEPS}`;
  const command = [
    `montage output/${setup.PHOTO_PREFIX}_*.webp`,
    `-resize ${cellSize}x${cellSize}`,
    `-tile ${tile}`,
    `-geometry ${cellSize}x${cellSize}+0+0`,
    "-background none",
    "output/AvatarSprite.webp",
  ].join(" ");

  logWithNewLine(`Building sprite: ${command}`);

  try {
    await exec(command, { cwd: __dirname });
    logWithNewLine("Sprite created: output/AvatarSprite.webp");
  } catch (error) {
    console.error("Failed to create sprite:", error);
    process.exitCode = 1;
  }
}

async function promptForNumber(message: string, defaultValue: number) {
  if (!process.stdin.isTTY) return defaultValue;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => rl.question(message, resolve));
  rl.close();

  const parsed = Number(answer.trim());
  if (Number.isNaN(parsed) || parsed <= 0) {
    logWithNewLine(`Invalid value. Using default: ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

function getGridSizeFromArgs(rawValue?: string) {
  if (!rawValue) return DEFAULT_GRID_SIZE;

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error("Grid size must be a positive integer, e.g. `npm run generate 5`");
    process.exit(1);
  }

  if (Number(parsed) % 2 !== 1) {
    console.error("Grid size must be an odd integer, e.g. `npm run generate 5`");
    process.exit(1);
  }

  return parsed;
}

async function promptForConfirmation(message: string) {
  if (!process.stdin.isTTY) {
    return true;
  }

  const options = ["Yes", "No"];
  let selected = 0;

  const render = () => {
    const display = options
      .map((option, index) =>
        index === selected ? `[${option}]` : ` ${option} `
      )
      .join("  ");

    process.stdout.write(`\r${message} ${display}`);
  };

  return new Promise<boolean>((resolve) => {
    const handleData = (data: Buffer) => {
      const key = data.toString();

      if (key === "\u0003") {
        process.exit();
      }

      const moveLeft = key === "\u001b[D" || key === "\u001b[A";
      const moveRight = key === "\u001b[C" || key === "\u001b[B";

      if (moveLeft) {
        selected = (selected + options.length - 1) % options.length;
        render();
        return;
      }

      if (moveRight) {
        selected = (selected + 1) % options.length;
        render();
        return;
      }

      if (key === "\r") {
        cleanup();
        process.stdout.write("\n");
        resolve(selected === 0);
      }
    };

    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off("data", handleData);
    };

    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", handleData);
    render();
  });
}

function generateSteps(setup: Setup) {
  const {
    X_STEPS,
    Y_STEPS,
    PHOTO_PREFIX,
    ROTATE_BOUND,
    PUPIL_BOUND
  } = setup;

  const valueAt = (
    stepIndex: number,
    totalSteps: number,
    bound: number,
    { invert = false } = {}
  ) => {
    if (totalSteps === 1) return 0;
    const normalized = (stepIndex / (totalSteps - 1)) * 2 - 1; // range -1..1
    const value = bound * normalized;
    return round(invert ? -value : value, 10);
  };

  const steps: Step[][] = [];

  for (let y = 0; y < Y_STEPS; y += 1) {
    const row: Step[] = [];

    for (let x = 0; x < X_STEPS; x += 1) {
      const index = y * X_STEPS + x;

      row.push({
        x,
        y,
        index,
        // Horizontal Head Rotation - X-axis 20 = look left. -20 = look right.
        rotate_yaw: valueAt(x, X_STEPS, ROTATE_BOUND),
        // Vertical Head Rotation - Y-axis. 20 = look down. -20 = look up.
        rotate_pitch: valueAt(y, Y_STEPS, ROTATE_BOUND),
        // Roll matches the pitch (inverted) - natural head tilt when looking up/down
        // rotate_roll: -rotate_pitch,
        pupil_x: valueAt(x, X_STEPS, PUPIL_BOUND),
        pupil_y: valueAt(y, Y_STEPS, PUPIL_BOUND, { invert: true }),
        filename: `${PHOTO_PREFIX}_${String(index).padStart(3,"0")}.webp`,
        crop_factor: 1.5, // lowest possible
        output_quality: 100,
      });
    }

    steps.push(row);
  }

  return steps;
}


/*
  Based on https://github.com/kylan02/face_looker/blob/main/main.py
*/
