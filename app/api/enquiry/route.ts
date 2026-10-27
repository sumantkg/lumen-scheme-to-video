import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEnquiryNotification } from "@/lib/mailer";
import { z } from "zod";

const EnquirySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().email("Please enter a valid email address."),
  message: z.string().trim().min(5, "Please enter a message with at least 5 characters.").max(3000),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = EnquirySchema.safeParse(json);

    if (!result.success) {
      const issue = result.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: issue }, { status: 400 });
    }

    const { name, email, message } = result.data;

    // Save in DB so it's never lost
    const enquiry = await prisma.enquiry.create({
      data: {
        name,
        email,
        message,
        status: "new",
      },
    });

    // Send email notification to user
    const emailResult = await sendEnquiryNotification({ name, email, message });

    return NextResponse.json({
      ok: true,
      id: enquiry.id,
      emailSent: emailResult.sent,
    });
  } catch (err: unknown) {
    console.error("[Enquiry API Error]", err);
    return NextResponse.json(
      { error: "Failed to submit enquiry. Please try again or email us directly." },
      { status: 500 }
    );
  }
}
