import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from api import database, main as api_main


class ProfileUpdateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.user = {"username": "ana", "role": "Analista de Datos", "permissions": ["dashboard"]}

    def test_rejects_request_without_fields(self) -> None:
        request = api_main.ProfileUpdateRequest()
        with self.assertRaises(HTTPException) as context:
            api_main.update_profile(request, authorization="Bearer token", user=self.user)
        self.assertEqual(context.exception.status_code, 422)

    def test_rejects_password_change_without_current_password(self) -> None:
        request = api_main.ProfileUpdateRequest(new_password="nueva-contraseña-segura")
        with self.assertRaises(HTTPException) as context:
            api_main.update_profile(request, authorization="Bearer token", user=self.user)
        self.assertEqual(context.exception.status_code, 422)

    def test_rejects_wrong_current_password(self) -> None:
        stored_hash = database.hash_password("contraseña-actual-123")
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = {"password_hash": stored_hash}
        connection = MagicMock()
        connection.__enter__.return_value = conn

        request = api_main.ProfileUpdateRequest(current_password="incorrecta-123456", new_password="nueva-contraseña-segura")
        with patch.object(api_main.database, "connection", return_value=connection):
            with self.assertRaises(HTTPException) as context:
                api_main.update_profile(request, authorization="Bearer token", user=self.user)

        self.assertEqual(context.exception.status_code, 400)
        executed_sql = " ".join(str(call.args[0]) for call in conn.execute.call_args_list)
        self.assertNotIn("UPDATE managed_users SET password_hash", executed_sql)


if __name__ == "__main__":
    unittest.main()
