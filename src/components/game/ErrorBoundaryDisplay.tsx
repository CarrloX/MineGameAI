"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryDisplayProps {
  title: string;
  message: string;
  onClose: () => void;
}

export default function ErrorBoundaryDisplay({
  title,
  message,
  onClose,
}: ErrorBoundaryDisplayProps) {
  return (
    <AlertDialog open={true} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-2xl bg-background/95 backdrop-blur-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription className="whitespace-pre-wrap text-sm max-h-[60vh] overflow-y-auto">
          <p className="mb-2 text-foreground">
            Ocurrió un error en el juego. Por favor, copia el siguiente mensaje
            para ayudar a depurarlo:
          </p>
          <textarea
            readOnly
            aria-label="Mensaje de error para depuración"
            className="w-full p-2 border rounded bg-muted text-muted-foreground text-xs h-60 font-mono"
            value={message}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button onClick={onClose} variant="outline">
            Cerrar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
