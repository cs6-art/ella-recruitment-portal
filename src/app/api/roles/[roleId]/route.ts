import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getRoleRequestById,
  getRoleStatusHistory,
} from "@/lib/google-sheets";
import { canViewRole } from "@/lib/access-control";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    roleId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  console.log(
    "[API Role Details] GET started",
  );

  try {
    const cookieStore = await cookies();

    const user = verifySessionToken(
      cookieStore.get(COOKIE_NAME)?.value,
    );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 },
      );
    }

    const { roleId } = await context.params;

    const role =
      await getRoleRequestById(roleId);

    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: "Role request not found.",
        },
        { status: 404 },
      );
    }

    if (!canViewRole(user, role)) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to view this role request." },
        { status: 403 },
      );
    }

    const history = await getRoleStatusHistory(
      role.roleId,
    );

    console.log(
      "[API Role Details] Returning role:",
      role.roleId,
    );

    return NextResponse.json(
      {
        success: true,
        role,
        history,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[API Role Details] GET failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the role request.",
      },
      { status: 500 },
    );
  }
}
