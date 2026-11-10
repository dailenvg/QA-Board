import { configure } from "@testing-library/react";

// CI runs every package's tests at once, so the default 1s wait is sometimes too short.
configure({ asyncUtilTimeout: 5000 });
