import type { Metadata } from "next";
import AiVmOciClient from "./AiVmOciClient";

export const metadata: Metadata = {
  title: "AI VM-OCI | Control Room",
  description: "OCI infrastructure workspace",
};

export default function AiVmOciPage() {
  return <AiVmOciClient />;
}
