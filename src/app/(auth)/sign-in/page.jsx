"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import Image from "next/image";
import React from "react";

const Page = () => {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 md:py-32">
      <div className="flex flex-row items-center justify-center gap-x-2">
        <h1 className="text-3xl font-extrabold text-foreground">
          Welcome to Regen AI
        </h1>
      </div>

      <p className="mt-2 text-lg font-semibold text-muted-foreground">
        Sign in below (we will increase your message limits if you do 😄)
      </p>

      <Button
        variant="default"
        className="mt-5 flex w-full max-w-sm cursor-pointer flex-row items-center justify-center px-7 py-7"
        onClick={() =>
          signIn.social({
            provider: "github",
            callbackURL: "/",
          })
        }
      >
        <Image src="/github.svg" alt="GitHub" width={24} height={24} />
        <span className="ml-2 font-bold">Sign in with GitHub</span>
      </Button>
    </section>
  );
};

export default Page;
