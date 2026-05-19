import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // next-intl は ESM のみのため、Jest 環境では手製モックを使う
    "^next-intl$": "<rootDir>/src/__mocks__/next-intl.tsx",
  },
  testRegex: ".*\\.(spec|test)\\.tsx?$",
  transform: {
    "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  passWithNoTests: true,
};

export default config;
