import React, { useState } from "react";
import Input from "./ui/Input";
import Button from "./ui/Button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { Contact } from "../types/supabase";
import CreditPurchaseModal from "./CreditPurchaseModal";
import { loadStripe } from "@stripe/stripe-js";

import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";

interface ContactFormProps {
  contact?: Contact;
  isEditing?: boolean;
}

const ContactForm: React.FC<ContactFormProps> = ({
  contact,
  isEditing = false,
}) => {
  const [name, setName] = useState(contact?.name || "");
  const [lastName, setLastName] = useState(contact?.last_name || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [address, setAddress] = useState(contact?.address || "");
  const [postalCode, setPostalCode] = useState(contact?.postal_code || "");
  const [note, setNote] = useState(contact?.note || "");
  const [document, setDocument] = useState<File | null>(null);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  }>({});
  const stripePromise = loadStripe(
    "sk_test_51RPLPVQBeFk3RpuyGqIfJNsiMsQv5Quz9NILcXqT4haFe5OHQtvEeyE0q71IhaxFGrI0CMYC9VgJmLXscXXAtxT300A8CqHFSN"
  );

  const handleSelectAddress = async (selectedAddress: string) => {
    setAddressInput(selectedAddress, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address: selectedAddress });
      const { lat, lng } = await getLatLng(results[0]);

      setLat(lat);
      setLng(lng);
      setAddress(selectedAddress);

      // Extraire le code postal
      const postalComponent = results[0].address_components.find((component) =>
        component.types.includes("postal_code")
      );
      setPostalCode(postalComponent?.long_name || "");
    } catch (error) {
      console.error("Error getting geocode:", error);
    }
  };

  const [loading, setLoading] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);

  const { user, credits, decrementCredit } = useAuth();
  const navigate = useNavigate();

  // Google Places autocomplete
  const {
    ready,
    value: addressInput,
    setValue: setAddressInput,
    suggestions: { status, data },
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      /* Optionnel : restreindre à un pays, ex: componentRestrictions: { country: 'fr' } */
    },
    debounce: 300,
  });

  handleSelectAddress;

  // Validation simple
  const validate = (): boolean => {
    const newErrors: {
      name?: string;
      lastName?: string;
      address?: string;
      postalCode?: string;

      phone?: string;
      email?: string;
    } = {};

    if (!name.trim()) newErrors.name = "First name is required";
    if (!lastName.trim()) newErrors.lastName = "Last name is required";

    if (!phone.trim()) {
      newErrors.phone = "Phone is required";
    } else if (
      !/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(
        phone.replace(/\s/g, "")
      )
    ) {
      newErrors.phone = "Please enter a valid phone number";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (!isEditing && credits < 1) {
      // Ici, au lieu de setShowCreditModal(true), on crée une session Stripe
      setLoading(true);
      try {
        const stripe = await stripePromise;

        // Appel API backend pour créer une session Checkout
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user!.id,
            // éventuellement d'autres infos nécessaires
          }),
        });

        const session = await response.json();

        if (session.error) {
          toast.error("Erreur lors de la création de la session de paiement.");
          setLoading(false);
          return;
        }

        // Redirige vers Stripe Checkout
        const { error } = await stripe!.redirectToCheckout({
          sessionId: session.id,
        });

        if (error) {
          toast.error(error.message || "An unexpected error occurred.");
        }
      } catch (error) {
        console.error("Stripe checkout error:", error);
        toast.error("Erreur lors du paiement.");
      } finally {
        setLoading(false);
      }

      return; // stoppe le reste pour attendre le paiement
    }

    // ... ton code pour upload, insert/update supabase, etc.
    setLoading(true);

    try {
      let documentUrl = null;
      if (document) {
        const { data, error: uploadError } = await supabase.storage
          .from("document")
          .upload(`document/${document.name}`, document);

        if (uploadError) throw uploadError;

        documentUrl = data?.path || null;
      }

      const contactData = {
        name,
        last_name: lastName,
        phone,
        email,
        address: address || addressInput,
        postal_code: postalCode,
        note,
        document_url: documentUrl,
        created_by: user!.id,
        latitude: lat,
        longitude: lng,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("contacts")
          .update(contactData)
          .eq("id", contact!.id);

        if (error) throw error;

        toast.success("Contact updated successfully");
      } else {
        const { error } = await supabase.from("contacts").insert(contactData);

        if (error) throw error;

        await decrementCredit();
        toast.success("Contact created successfully");
      }

      navigate("/");
      window.location.reload();
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error(
        isEditing ? "Failed to update contact" : "Failed to create contact"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {!isEditing && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-blue-700">
                Creating a new contact will use 1 credit
              </p>
              <span className="font-medium text-blue-800">
                {credits} {credits === 1 ? "credit" : "credits"} remaining
              </span>
            </div>
          </div>
        )}

        <Input
          label="First Name"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter contact first name"
          error={errors.name}
          required
        />
        <Input
          label="Last Name"
          id="last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Enter contact last name"
          error={errors.lastName}
          required
        />

        <Input
          label="Phone Number"
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Enter phone number"
          error={errors.phone}
          required
        />

        <Input
          label="Email"
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email"
          error={errors.email}
          required
        />

        {/* Adresse avec autocomplétion */}
        <div className="relative">
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700"
          >
            Address
          </label>
          <input
            id="address"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            disabled={!ready}
            placeholder="Enter address"
            autoComplete="off"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
            required
          />

          {status === "OK" && (
            <ul className="absolute z-10 bg-white border border-gray-300 w-full max-h-48 overflow-auto rounded-md shadow-md">
              {data.map(({ place_id, description }) => (
                <li
                  key={place_id}
                  onClick={() => handleSelectAddress(description)}
                  className="cursor-pointer px-4 py-2 hover:bg-gray-100"
                >
                  {description}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Input
          label="Postal Code"
          id="postal-code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="Enter postal code"
          required
        />

        <label
          htmlFor="note"
          className="block text-sm font-medium text-gray-700"
        >
          Note
        </label>
        <textarea
          id="note"
          placeholder="Add a note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Latitude"
            id="latitude"
            value={lat?.toString() || ""}
            readOnly
            placeholder="Latitude"
          />
          <Input
            label="Longitude"
            id="longitude"
            value={lng?.toString() || ""}
            readOnly
            placeholder="Longitude"
          />
        </div>

        <label
          htmlFor="note"
          className="block text-sm font-medium text-gray-700"
        >
          Upload Document
        </label>
        <div
          style={{
            display: "inline-block",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            border: "2px solid #007bff",
            borderRadius: "8px",
            padding: "8px 15px",
            color: "#007bff",
            fontWeight: "600",
            fontSize: "14px",
            userSelect: "none",
            width: "250px",
            textAlign: "center",
            backgroundColor: "#f9f9f9",
            transition: "background-color 0.3s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#e6f0ff")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "#f9f9f9")
          }
        >
          {document ? document.name : "Choisir un fichier"}
          <input
            type="file"
            onChange={(e) =>
              setDocument(e.target.files ? e.target.files[0] : null)
            }
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              opacity: 0,
              width: "100%",
              height: "100%",
              cursor: "pointer",
            }}
          />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => navigate("/")}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? "Update Contact" : "Create Contact"}
          </Button>
        </div>
      </form>

      <CreditPurchaseModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
      />
    </>
  );
};

export default ContactForm;
