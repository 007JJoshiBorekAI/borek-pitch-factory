"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type AppLanguage = "en" | "de";

export const APP_COPY = {
  en: {
    auth: {
      welcome: "Welcome",
      welcomeSubtitle: "Sign in with your Borek account to continue.",
      headline: "Prepare the right conversation.",
      tagline: "From client research to an approved follow-up, all in one focused workspace.",
      internal: "Internal · Borek Solutions",
      continueMicrosoft: "Continue with Microsoft",
      wait: "Please wait…",
      remember: "Keep me signed in on this device",
      support: "Need access? Contact IT Support.",
      previewOpen: "Open local preview",
      previewAvailable: "Local preview uses sample data stored in this browser. Nothing is sent to the API.",
      unavailable: "Microsoft sign-in is not configured for this environment.",
      signInFailed: "Microsoft sign-in did not complete:",
      devSignIn: "Sign in as local developer",
      devNotice: "Development sign-in: Microsoft is bypassed and the local API acts as its configured development user. Never available in production.",
      devRejected: "The API rejected the development sign-in. It must run with AUTH_BYPASS=true, the memory backend, DEV_AUTH_USER_ID and DEV_AUTH_EMAIL, outside the production profile.",
      devUnreachable: "The API could not be reached. Check that it is running and try again.",
      bypassIgnored: "A development sign-in flag is set but ignored: it only works on localhost outside the production profile.",
    },
    language: "Language",
    sidebar: { preMeeting: "Pre-meeting", postMeeting: "Post-meeting", clients: "Clients" },
    header: { clients: "Clients", addClient: "Add New Client", pitchGeneration: "Pitch generation", profile: "Profile", signIn: "Sign in" },
    clients: {
      kicker: "Clients", title: "Clients", activePitches: "active pitches", add: "Add new client",
      search: "Search clients", all: "All clients", preMeeting: "Pre-meeting", postMeeting: "Post-meeting",
      client: "Client", contact: "Contact", workflow: "Pitch workflow", activity: "Last activity",
      open: "Open", showing: "Showing", of: "of", noMatch: "No clients match",
      noMatchHelp: "Try another name or meeting phase.", today: "Today", yesterday: "Yesterday",
    },
    clientForm: {
      breadcrumb: "Clients / Add New Client", editKicker: "01 / Client information",
      createTitle: "Add New Client", editTitle: "Client Information",
      createLead: "Add a new client and the context for the first meeting.",
      editLead: "Review the five canonical fields before Discovery generation begins.",
      company: "Company Name", contact: "Contact Person", website: "Website URL",
      purpose: "Meeting Purpose", additional: "Additional Information", required: "Required fields",
      logo: "Company Logo", optional: "Optional", uploadLogo: "Upload logo", industry: "Business Industry",
      selectIndustry: "Search or select an industry", phone: "POC Phone Number", countryCode: "Country code required",
      contactHelp: "Primary contact for this client account.",
      position: "POC Position", positionPlaceholder: "Role / position", relevantInformation: "Relevant Client Information",
      salesOpportunity: "Sales Opportunity", notes: "Notes", notesPlaceholder: "Type sales context…",
      pitchFiles: "Pitch Files", addPitchFiles: "Add pitch files", additionalOpportunity: "Additional Opportunity Information",
      companySection: "01 Company information", contactSection: "02 Point of contact", meetingSection: "03 Meeting context",
      cancel: "Cancel", create: "Create client", save: "Save client information", saving: "Saving…",
      savePitch: "Save pitch information", generatePitch: "Generate pitch", backStep: "Back",
      reviewTitle: "Ready to generate", reviewLead: "Client and pitch information are complete. Generate the pre-meeting materials now.",
      back: "Back to clients", reload: "Reload", edit: "Edit", continue: "Continue to Discovery",
      revision: "Fixture revision",
      informationSection: "Client information",
      preMeetingTitle: "PRE-MEETING", preMeetingLead: "One submission creates both.",
      stepClient: "Client information", stepPitch: "Pitch information", stepGenerate: "Generate",
      oneFlow: "One flow", createSummary: "Create client", clientProfile: "Client profile",
      firstPitch: "First pitch", pitchGeneration: "Pitch generation", created: "Created",
      startsAutomatically: "Starts automatically", createAndPitch: "Create client & pitch",
      generationTime: "Pitch generation usually takes about 6 minutes.",
    },
    workflow: {
      creating: "Creating your pitch", opportunity: "Opportunity", fixture: "Fixture preview",
      blocked: "Integration blocked:", current: "Current", completed: "Completed", unavailable: "Blocked",
      discovery: "Discovery Document", presentation: "Presentation",
      statuses: {
        client_information: "Client Information", discovery_prepared: "Discovery Prepared", ppt_1_ready: "PPT #1 Ready",
        first_meeting_completed: "First Meeting Completed", transcript_added: "Transcript Added",
        ppt_2_generated: "PPT #2 Generated", owner_review: "Owner Review", finalized: "Finalized",
      },
    },
  },
  de: {
    auth: {
      welcome: "Willkommen",
      welcomeSubtitle: "Melden Sie sich mit Ihrem Borek-Konto an, um fortzufahren.",
      headline: "Bereiten Sie das richtige Gespräch vor.",
      tagline: "Von der Kundenrecherche bis zum freigegebenen Follow-up in einem fokussierten Arbeitsbereich.",
      internal: "Intern · Borek Solutions",
      continueMicrosoft: "Mit Microsoft fortfahren",
      wait: "Bitte warten…",
      remember: "Auf diesem Gerät angemeldet bleiben",
      support: "Benötigen Sie Zugriff? Kontaktieren Sie den IT-Support.",
      previewOpen: "Lokale Vorschau öffnen",
      previewAvailable: "Die lokale Vorschau verwendet Beispieldaten in diesem Browser. Es wird nichts an die API gesendet.",
      unavailable: "Die Microsoft-Anmeldung ist für diese Umgebung nicht konfiguriert.",
      signInFailed: "Die Microsoft-Anmeldung wurde nicht abgeschlossen:",
      devSignIn: "Als lokaler Entwickler anmelden",
      devNotice: "Entwickleranmeldung: Microsoft wird umgangen und die lokale API arbeitet als konfigurierter Entwicklungsbenutzer. In der Produktion nie verfügbar.",
      devRejected: "Die API hat die Entwickleranmeldung abgelehnt. Sie muss mit AUTH_BYPASS=true, dem Memory-Backend, DEV_AUTH_USER_ID und DEV_AUTH_EMAIL außerhalb des Produktionsprofils laufen.",
      devUnreachable: "Die API ist nicht erreichbar. Prüfen Sie, ob sie läuft, und versuchen Sie es erneut.",
      bypassIgnored: "Ein Flag für die Entwickleranmeldung ist gesetzt, wird aber ignoriert: Es funktioniert nur auf localhost außerhalb des Produktionsprofils.",
    },
    language: "Sprache",
    sidebar: { preMeeting: "Vor dem Meeting", postMeeting: "Nach dem Meeting", clients: "Kunden" },
    header: { clients: "Kunden", addClient: "Neuen Kunden anlegen", pitchGeneration: "Pitch-Erstellung", profile: "Profil", signIn: "Anmelden" },
    clients: {
      kicker: "Kunden", title: "Kunden", activePitches: "aktive Pitches", add: "Neuen Kunden anlegen",
      search: "Kunden suchen", all: "Alle Kunden", preMeeting: "Vor dem Meeting", postMeeting: "Nach dem Meeting",
      client: "Kunde", contact: "Kontakt", workflow: "Pitch-Ablauf", activity: "Letzte Aktivität",
      open: "Öffnen", showing: "Anzeige", of: "von", noMatch: "Keine passenden Kunden",
      noMatchHelp: "Versuchen Sie einen anderen Namen oder eine andere Meeting-Phase.", today: "Heute", yesterday: "Gestern",
    },
    clientForm: {
      breadcrumb: "Kunden / Neuen Kunden anlegen", editKicker: "01 / Kundeninformationen",
      createTitle: "Neuen Kunden anlegen", editTitle: "Kundeninformationen",
      createLead: "Fügen Sie einen neuen Kunden und den Kontext für das erste Meeting hinzu.",
      editLead: "Prüfen Sie die fünf Pflichtfelder, bevor die Discovery-Erstellung beginnt.",
      company: "Unternehmensname", contact: "Kontaktperson", website: "Website-URL",
      purpose: "Zweck des Meetings", additional: "Zusätzliche Informationen", required: "Pflichtfelder",
      logo: "Unternehmenslogo", optional: "Optional", uploadLogo: "Logo hochladen", industry: "Branche",
      selectIndustry: "Branche suchen oder auswählen", phone: "Telefonnummer der Kontaktperson", countryCode: "Ländervorwahl erforderlich",
      contactHelp: "Hauptkontakt für dieses Kundenkonto.",
      position: "Position der Kontaktperson", positionPlaceholder: "Rolle / Position", relevantInformation: "Relevante Kundeninformationen",
      salesOpportunity: "Verkaufschance", notes: "Notizen", notesPlaceholder: "Vertriebskontext eingeben…",
      pitchFiles: "Pitch-Dateien", addPitchFiles: "Pitch-Dateien hinzufügen", additionalOpportunity: "Zusätzliche Opportunity-Informationen",
      companySection: "01 Unternehmensinformationen", contactSection: "02 Kontaktperson", meetingSection: "03 Meeting-Kontext",
      cancel: "Abbrechen", create: "Kunden anlegen", save: "Kundeninformationen speichern", saving: "Speichern…",
      savePitch: "Pitch-Informationen speichern", generatePitch: "Pitch erstellen", backStep: "Zurück",
      reviewTitle: "Bereit zur Erstellung", reviewLead: "Kunden- und Pitch-Informationen sind vollständig. Erstellen Sie jetzt die Pre-Meeting-Unterlagen.",
      back: "Zurück zu Kunden", reload: "Neu laden", edit: "Bearbeiten", continue: "Weiter zu Discovery",
      revision: "Fixture-Revision",
      informationSection: "Kundeninformationen",
      preMeetingTitle: "VOR DEM MEETING", preMeetingLead: "Eine Eingabe erstellt beides.",
      stepClient: "Kundeninformationen", stepPitch: "Pitch-Informationen", stepGenerate: "Erstellen",
      oneFlow: "Ein Ablauf", createSummary: "Kunden anlegen", clientProfile: "Kundenprofil",
      firstPitch: "Erster Pitch", pitchGeneration: "Pitch-Erstellung", created: "Erstellt",
      startsAutomatically: "Startet automatisch", createAndPitch: "Kunden und Pitch anlegen",
      generationTime: "Die Pitch-Erstellung dauert normalerweise etwa 6 Minuten.",
    },
    workflow: {
      creating: "Pitch wird erstellt", opportunity: "Opportunity", fixture: "Fixture-Vorschau",
      blocked: "Integration blockiert:", current: "Aktuell", completed: "Abgeschlossen", unavailable: "Gesperrt",
      discovery: "Discovery-Dokument", presentation: "Präsentation",
      statuses: {
        client_information: "Kundeninformationen", discovery_prepared: "Discovery vorbereitet", ppt_1_ready: "PPT #1 bereit",
        first_meeting_completed: "Erstes Meeting abgeschlossen", transcript_added: "Transkript hinzugefügt",
        ppt_2_generated: "PPT #2 erstellt", owner_review: "Prüfung durch Owner", finalized: "Finalisiert",
      },
    },
  },
} as const;

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  copy: (typeof APP_COPY)[AppLanguage];
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  copy: APP_COPY.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("borek-language");
    const initial = stored === "de" ? "de" : "en";
    setLanguageState(initial);
    document.documentElement.lang = initial;
  }, []);

  function setLanguage(next: AppLanguage) {
    setLanguageState(next);
    window.localStorage.setItem("borek-language", next);
    document.documentElement.lang = next;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, copy: APP_COPY[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
